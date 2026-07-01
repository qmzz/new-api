# new-api 高阶使用手册

本文基于本地源码 `/home/percy/projects/new-api` 分析整理，当前分析版本为 `main` 分支 HEAD `df44a75d`。

## 1. 核心架构

new-api 是一个多上游、多分组、多计费规则的 AI 网关。请求进入 `/v1/*`、`/v1beta/*`、`/mj/*`、`/suno/*` 后，大致流程是：

认证用户/token -> 解析模型 -> 选择用户可用分组 -> 选择渠道 -> 模型映射/参数改写 -> 上游请求 -> 统计 usage -> 结算扣费 -> 记录日志。

关键源码：

- `main.go`
- `middleware/distributor.go`
- `model/channel_cache.go`
- `service/billing_session.go`

## 2. 渠道高级配置

渠道选择不是简单按顺序走。核心依据是 `Ability` 表：`group + model + channel_id + enabled + priority + weight + tag`。

选择逻辑：

- 先按用户分组和模型名找可用渠道。
- 支持模型名规范化匹配。
- Advanced Custom 渠道会额外检查当前请求 path 是否被该渠道支持。
- 按 `priority` 从高到低选择。
- 第一次请求用最高优先级；重试时逐级降低优先级。
- 同优先级内按 `weight` 加权随机；权重太小时源码里做了平滑处理，避免低权重完全失效。
- `auto` 分组会基于用户可用组自动跨组，跨组请求会影响最终 `group_ratio`。

建议用法：

- 同供应商多账号：同模型同分组，设置相同 priority，不同 weight。
- 主备上游：主渠道 priority 10，备渠道 priority 0，失败重试自动降级。
- VIP 与普通用户：建 `default`、`vip` 分组，渠道和计费倍率分开配置。
- 灰度新渠道：给新渠道低 weight 或单独 tag，逐步放量。

## 3. 多 Key 渠道

多 Key 不是多个渠道，而是一个渠道内多把 key。源码里 `ChannelInfo` 维护：

- `is_multi_key`
- `multi_key_size`
- `multi_key_status_list`
- `multi_key_mode`: `random` 或 `polling`
- 禁用原因和禁用时间

Key 来源是渠道 `Key` 字段，通常按换行拆分。`random` 只从启用 key 中随机取；`polling` 使用渠道级锁轮询，适合均匀消耗。

状态含义：

- `1`: 启用
- `2`: 手动禁用
- `3`: 自动禁用

高阶建议：

- 大量 key 建议用一个多 Key 渠道，便于统一模型、分组、倍率。
- 如果不同 key 的质量、地区、价格不同，不要放一个多 Key 渠道，应该拆成多个渠道并用 priority/weight 控制。
- 自动禁用 key 后，可在多 Key 管理里只删除自动禁用 key；手动禁用 key 会保留。

## 4. 渠道粘性 Channel Affinity

配置项是 `channel_affinity_setting`，源码默认启用：

- Codex CLI：`/v1/responses`，从 body 的 `prompt_cache_key` 提取粘性 key。
- Claude CLI：`/v1/messages`，从 `metadata.user_id` 提取粘性 key。
- 默认 TTL 3600 秒。
- 默认会透传 Codex/Claude CLI 所需 header。
- 可以配置失败后是否跳过重试：`skip_retry_on_failure`。
- 可以按规则名、模型名、分组拼接缓存 key，避免跨分组串扰。

适合场景：

- Codex、Claude CLI 这类强依赖 prompt cache 的客户端。
- 希望同一会话持续命中同一上游缓存。
- 多渠道同模型高可用，但又想保留缓存命中率。

风险点：

- 如果粘住的渠道质量下降，可能短时间内持续命中坏渠道。
- `skip_retry_on_failure=true` 时，失败不会继续换渠道，适合缓存一致性优先，不适合高可用优先。
- 如果关闭 Redis，多实例部署时粘性缓存只在本实例生效。

## 5. 模型映射

渠道支持 `model_mapping`，源码支持链式映射和循环检测。例如：

```json
{
  "gpt-4.1": "gpt-4.1-2025-04-14",
  "gpt-4.1-latest": "gpt-4.1"
}
```

实际会追到链尾。不要配置循环，例如 `a -> b -> a`，源码会报 `model_mapping_contains_cycle`。

典型用法：

- 对外暴露统一模型名，对内映射到不同供应商模型。
- 给用户稳定入口，例如只让用户用 `gpt-4.1`，后台逐步切换真实上游。
- 和渠道 priority 配合，实现同一个模型名走多个不同供应商。

## 6. 参数覆盖 Param Override

这是最强的请求改写能力。新格式是：

```json
{
  "operations": [
    {
      "mode": "set",
      "path": "temperature",
      "value": 0.7,
      "conditions": [
        { "path": "original_model", "mode": "contains", "value": "gpt" }
      ],
      "logic": "AND"
    }
  ]
}
```

支持操作包括：

- body 字段：`set`、`delete`、`copy`、`move`
- 字符串：`replace`、`regex_replace`、`trim_prefix`、`ensure_suffix`
- 数组/对象：`append`、`prepend`、`prune_objects`
- header：`set_header`、`delete_header`、`copy_header`、`move_header`、`pass_headers`
- 拦截请求：`return_error`
- body/header 同步：`sync_fields`

可用上下文包括：

- `model`
- `upstream_model`
- `original_model`
- `request_path`
- `request_headers`
- `retry_index`
- `is_retry`
- `last_error.status_code`
- `last_error.code`
- `is_channel_test`

重试时切换参数示例：

```json
{
  "operations": [
    {
      "mode": "set",
      "path": "temperature",
      "value": 0,
      "conditions": [
        { "path": "retry_index", "mode": "gte", "value": 1 }
      ],
      "logic": "AND"
    }
  ]
}
```

透传客户端 header 示例：

```json
{
  "operations": [
    {
      "mode": "pass_headers",
      "value": ["X-Request-Id", "User-Agent"],
      "keep_origin": true
    }
  ]
}
```

## 7. Advanced Custom 渠道

Advanced Custom 是类型 `58`，用于把 new-api 变成自定义协议网关。配置在渠道 `settings.advanced_custom`：

```json
{
  "advanced_routes": [
    {
      "incoming_path": "/v1/chat/completions",
      "upstream_path": "/v1beta/models/{model}:generateContent",
      "converter": "openai_chat_completions_to_gemini_generate_content",
      "auth": {
        "type": "query",
        "name": "key",
        "value": "{api_key}"
      }
    }
  ]
}
```

支持 converter：

- `none`
- `anthropic_messages_to_openai_chat_completions`
- `openai_chat_completions_to_anthropic_messages`
- `openai_chat_completions_to_openai_responses`
- `gemini_generate_content_to_openai_chat_completions`
- `openai_chat_completions_to_gemini_generate_content`

支持鉴权：

- 默认 Bearer
- `none`
- 自定义 header
- 自定义 query
- `{api_key}` 会替换为渠道密钥

适合场景：

- 把 OpenAI Chat 请求转 Gemini。
- 把 Claude Messages 请求转 OpenAI Chat。
- 接入非内置供应商，只要它兼容 OpenAI/Claude/Gemini 某种格式。
- 一个渠道支持多个 path，例如 chat、embeddings、images 分别路由。

## 8. 计费系统

new-api 有两套计费模型。

普通倍率/固定价：

- `ModelRatio`
- `ModelPrice`
- `CompletionRatio`
- `CacheRatio`
- `CreateCacheRatio`
- `ImageRatio`
- `AudioRatio`
- `AudioCompletionRatio`
- `GroupRatio`
- `GroupGroupRatio`

优先级理解：

- 固定价 `ModelPrice` 适合图片、任务、按次计费。
- 倍率 `ModelRatio` 适合 token 计费。
- `GroupRatio` 是使用分组倍率。
- `GroupGroupRatio` 是“用户所属组使用某个目标组”的特殊倍率，优先于普通 `GroupRatio`。

阶梯表达式计费配置在 `billing_setting`：

```json
{
  "billing_mode": {
    "gpt-example": "tiered_expr"
  },
  "billing_expr": {
    "gpt-example": "tier(\"base\", p * 2 + c * 8)"
  }
}
```

表达式变量常用：

- `p`: prompt tokens
- `c`: completion tokens
- `len`: 原始输入长度，适合做阶梯判断
- `cr`: cache read
- `cc`: cache create
- `img`: 图片数量
- `ai`: audio input
- `ao`: audio output

表达式输出是美元 / 1M tokens 语义，源码再换算成 quota，并乘以分组倍率。阶梯计费适合长上下文模型、不同 token 段不同价格、图片/音频混合计费。

## 9. 订阅与钱包

订阅不是普通余额，它是独立资金源。用户设置 `billing_preference`：

- `subscription_first`
- `wallet_first`
- `subscription_only`
- `wallet_only`

源码默认是 `subscription_first`。

套餐支持：

- 周期：年、月、日、小时、自定义秒数
- 总额度：`total_amount`，0 表示不限量
- 额度重置：never、daily、weekly、monthly、custom
- 购买后升级用户分组：`upgrade_group`
- 到期后降级分组：`downgrade_group`
- 订阅耗尽后是否允许钱包兜底：`allow_wallet_overflow`
- 最大购买次数：`max_purchase_per_user`
- 支付方式：余额、Stripe、Creem、Waffo Pancake 等

重要行为：

- 订阅预扣必须创建 `request_id` 幂等记录。
- 请求失败退款按这个记录退，避免重复退款。
- 异步任务必须全额预扣，不走信任额度旁路。
- 只要有一个活跃订阅禁止钱包溢出，订阅不足时就不会回退钱包。

## 10. 安全与权限

高阶安全点：

- root 是 superuser。
- admin 默认有多数渠道管理权限，但敏感写和密钥查看不是天然开放。
- 修改 `param_override`、`header_override` 等敏感字段会触发权限检查。
- 管理/root 写操作会记审计日志。
- 敏感操作可走 Secure Verification，默认 5 分钟有效。
- 支持 TOTP 2FA、backup code、Passkey/WebAuthn。
- Passkey 生产部署要正确配置 HTTPS、Origin、RPID。

公网部署建议：

- 配好 `SESSION_SECRET`。
- 开启 2FA/Passkey。
- 管理后台不要暴露给全网，至少加反代访问控制。
- admin 不要授予 secret view/sensitive write，除非确实需要。
- Webhook 支付回调必须使用公网可信域名，避免回调失败或支付网关误判。

## 11. 性能与运维

关键配置：

- `performance_setting.monitor_enabled`
- `monitor_cpu_threshold`
- `monitor_memory_threshold`
- `monitor_disk_threshold`
- `disk_cache_enabled`
- `disk_cache_threshold_mb`
- `disk_cache_max_size_mb`
- `perf_metrics_setting.enabled`
- `perf_metrics_setting.bucket_time`
- `perf_metrics_setting.flush_interval`

行为：

- Relay 请求前会检查 CPU、内存、磁盘，超过阈值直接返回 503。
- 大请求体和大 base64 文件可落磁盘缓存，降低内存峰值。
- `perf_metrics` 记录模型/分组维度延迟、TTFT、成功率、TPS。
- 多实例建议启用 Redis，否则缓存、粘性、部分状态只能本地生效。
- 系统任务使用 DB lease，避免多 master 重复执行。

## 12. 典型配置方案

高可用同模型：

- 三个渠道都支持 `gpt-4.1`
- 分组都填 `default`
- 主供应商 priority 10，weight 100
- 备用供应商 priority 0，weight 100
- 自动重试状态码用默认即可

VIP 分组：

- 用户可用组包含 `vip`
- VIP 渠道放 `vip` 分组
- `GroupRatio.vip` 设置不同倍率
- VIP 套餐购买后 `upgrade_group=vip`
- 到期 `downgrade_group=default`

Codex/Claude CLI 缓存友好：

- 保持 `channel_affinity_setting.enabled=true`
- 对 `/v1/responses` 和 `/v1/messages` 使用默认粘性规则
- 多实例必须配 Redis
- 如果更看重高可用，谨慎使用 `skip_retry_on_failure=true`

OpenAI Chat 转 Gemini：

- 建 Advanced Custom 渠道
- `incoming_path=/v1/chat/completions`
- `upstream_path=/v1beta/models/{model}:generateContent`
- `converter=openai_chat_completions_to_gemini_generate_content`
- `auth.type=query`
- `auth.name=key`
- `auth.value={api_key}`

## 13. 排错清单

- 请求找不到渠道：检查用户分组、渠道分组、模型名、Ability 是否启用。
- Advanced Custom 不命中：检查 `incoming_path` 是否等于实际 path，Gemini path 不要带 query。
- 重试没换渠道：检查是否只有一个 priority，或 channel affinity 配了 skip retry。
- 多 Key 仍用坏 key：检查 key 状态是否自动禁用，是否启用了多 Key 模式。
- 参数没改写：检查 JSON 是否是 `operations` 格式、path 是否正确、conditions 是否满足。
- 订阅没扣：检查用户 `billing_preference`、是否有活跃订阅、额度是否足够。
- 订阅不足没走钱包：检查套餐 `allow_wallet_overflow`。
- 大请求 OOM：开启 `disk_cache_enabled`，调低 `disk_cache_threshold_mb`。
- 多实例行为不一致：检查 Redis 是否启用，尤其是 channel affinity、缓存、订阅计划缓存。
