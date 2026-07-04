# tests/ — 防自欺纪律(宪法 §9 的落地)

> [PROTOCOL] 新增源码目录 ⇒ 镜像新增测试目录;新特性 ⇒ 先列与已有特性的交叉矩阵,再写用例,后写实现。

old_lumen 的教训:50 个绿测试没拦住致命 bug,因为全用替身绕过真实内核。这里的规则:

1. **禁全 mock 充数**:替身只允许出现在两条缝——ModelPort(录制-重放)与 HttpClient(罐装响应)。内核、runtime、存储、工作区一律走真实路径。
2. **不变式测试**(`invariants/`):铁律钉成断言——第 N 轮 tool_result 出现在第 N+1 轮 forModel() 里;压缩不丢存在事实;**同一组断言对 main 和 spawn 出的 worker 各跑一遍**。
3. **录制-重放**(`replay/`):fixture 为真实线格式,重放进默认内核路径跑端到端;详见 `replay/README.md`。
4. **协议契约**(`service/`):断开→重连→subscribe 回放,事件不丢不重;token 鉴权 4401。
5. **交叉矩阵**:spawn×resume、cancel/crash×resume、长任务×上下文折叠……特性两两交叉显式钉测试。

目录镜像 src:`adapters/ client/ invariants/ replay/ research/ runtime/ service/ storage/ workspace/`;共享脚手架在 `helpers/`(scripted-model 仅限单元级,禁入端到端)。

跑法:`npm test`(node --experimental-strip-types --test)。验收底线:每个里程碑至少一条真实/重放路径的端到端用例。
