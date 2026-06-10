// Lumen Tauri 薄外壳。
// 职责仅三件：① 起 agent-service sidecar（镜像 ../../agent-service/src/supervisor.ts 的契约）
//            ② 退出 app 时杀掉 sidecar（关窗口不杀——macOS 默认留 dock，后台自治成立）
//            ③ 渲染 UI（连 ws://127.0.0.1:<port>）
//
// 注意：本文件未经本机工具链编译验证（无 Rust/Tauri toolchain）。它落地的生命周期逻辑
// 已在 agent-service 的 supervisor.test.ts 里以 Node 进程级测试证明（spawn→portfile→连接→停止）。
// dev：固定 LUMEN_PORT=8787，前端默认 ws 即对上；prod 打包需 bundle node + service（后续）。

use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

struct Sidecar(Mutex<Option<Child>>);

fn spawn_service() -> std::io::Result<Child> {
    // dev：直接跑本地 TS 源；prod 改为打包后的 service 二进制
    Command::new("node")
        .args([
            "--experimental-strip-types",
            "../../agent-service/src/service.ts",
        ])
        .env("LUMEN_PORT", "8787")
        .spawn()
}

fn main() {
    tauri::Builder::default()
        .manage(Sidecar(Mutex::new(None)))
        .setup(|app| {
            match spawn_service() {
                Ok(child) => {
                    *app.state::<Sidecar>().0.lock().unwrap() = Some(child);
                }
                Err(err) => eprintln!("[lumen] 无法启动 agent-service sidecar: {err}"),
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error building tauri app")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                if let Some(mut child) = app_handle.state::<Sidecar>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
