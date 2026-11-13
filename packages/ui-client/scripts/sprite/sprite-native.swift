/**
 * [INPUT]: 显式进程 id、CGWindowList 与系统辅助功能授权
 * [OUTPUT]: 不依赖屏幕录制的窗口几何、AX 动作与原生合成鼠标/键盘事件
 * [POS]: 原生验收驱动；不调用产品内部测试接口，实际经过 AppKit/WebKit
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import AppKit
import ApplicationServices

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success ? value : nil
}
func windows(_ pid: pid_t) -> [[String: Any]] {
    let all = CGWindowListCopyWindowInfo(.optionAll, kCGNullWindowID) as? [[String: Any]] ?? []
    return all.filter { ($0[kCGWindowOwnerPID as String] as? Int) == Int(pid) }.map { row in
        ["bounds": row[kCGWindowBounds as String] ?? [:], "layer": row[kCGWindowLayer as String] ?? -1,
         "visible": row[kCGWindowIsOnscreen as String] ?? false, "alpha": row[kCGWindowAlpha as String] ?? 0,
         "id": row[kCGWindowNumber as String] ?? 0]
    }
}
func appWindows(_ app: AXUIElement) -> [AXUIElement] { attribute(app, kAXWindowsAttribute) as? [AXUIElement] ?? [] }
func mainWindow(_ app: AXUIElement) -> AXUIElement? {
    appWindows(app).first { item in
        guard let size = attribute(item, kAXSizeAttribute) else { return false }
        var result = CGSize.zero
        return AXValueGetValue(size as! AXValue, .cgSize, &result) && result.width > 500
    }
}
func label(_ item: AXUIElement) -> String {
    [kAXTitleAttribute, kAXDescriptionAttribute, kAXValueAttribute].compactMap { attribute(item, $0) as? String }.joined(separator: " | ")
}
func find(_ root: AXUIElement, _ text: String) -> AXUIElement? {
    var queue = [root], index = 0
    while index < queue.count && index < 10000 {
        let item = queue[index]; index += 1
        if label(item).split(separator: "|").contains(where: { $0.trimmingCharacters(in: .whitespaces) == text }) { return item }
        queue.append(contentsOf: attribute(item, kAXChildrenAttribute) as? [AXUIElement] ?? [])
    }
    return nil
}
func mouse(_ type: CGEventType, _ point: CGPoint, _ button: CGMouseButton = .left) {
    CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: button)?.post(tap: .cghidEventTap)
    Thread.sleep(forTimeInterval: 0.07)
}
func output(_ value: Any) {
    let data = try! JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    print(String(data: data, encoding: .utf8)!)
}
let args = Array(CommandLine.arguments.dropFirst())
let action = args.first ?? "permissions"
if action == "permissions" { output(["accessibility": AXIsProcessTrusted(), "screen": CGPreflightScreenCaptureAccess()]); exit(0) }
let pid = pid_t(args[1])!
let app = AXUIElementCreateApplication(pid)
let _ = AXUIElementSetAttributeValue(app, "AXManualAccessibility" as CFString, kCFBooleanTrue)
let _ = AXUIElementSetAttributeValue(app, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue)
let main = mainWindow(app)
switch action {
case "windows": output(windows(pid))
case "close":
    guard let main, let button = attribute(main, kAXCloseButtonAttribute) else { exit(2) }
    output(["result": AXUIElementPerformAction(button as! AXUIElement, kAXPressAction as CFString).rawValue])
case "minimize", "restore":
    guard let main else { exit(2) }
    output(["result": AXUIElementSetAttributeValue(main, kAXMinimizedAttribute as CFString, (action == "minimize") ? kCFBooleanTrue : kCFBooleanFalse).rawValue])
case "key":
    let keys: [String: CGKeyCode] = ["h": 4, "m": 46, "w": 13, "q": 12]
    NSRunningApplication(processIdentifier: pid)?.activate()
    Thread.sleep(forTimeInterval: 0.2)
    for down in [true, false] {
        let event = CGEvent(keyboardEventSource: nil, virtualKey: keys[args[2]]!, keyDown: down)!
        event.flags = .maskCommand; event.postToPid(pid)
        Thread.sleep(forTimeInterval: 0.08)
    }
    output(["sent": args[2]])
case "click", "right":
    let point = CGPoint(x: Double(args[2])!, y: Double(args[3])!)
    mouse(.mouseMoved, point)
    mouse(action == "right" ? .rightMouseDown : .leftMouseDown, point, action == "right" ? .right : .left)
    mouse(action == "right" ? .rightMouseUp : .leftMouseUp, point, action == "right" ? .right : .left)
    output(["sent": action])
case "drag":
    let start = CGPoint(x: Double(args[2])!, y: Double(args[3])!), end = CGPoint(x: Double(args[4])!, y: Double(args[5])!)
    mouse(.mouseMoved, start); mouse(.leftMouseDown, start)
    for i in 1...18 {
        let t = Double(i) / 18
        mouse(.leftMouseDragged, CGPoint(x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t))
    }
    mouse(.leftMouseUp, end); output(["sent": "drag"])
case "press":
    guard let item = find(app, args[2]) else { output(["missing": args[2]]); exit(3) }
    var target = item
    var attempts = 0
    while attempts < 8 {
        var actions: CFArray?
        AXUIElementCopyActionNames(target, &actions)
        if (actions as? [String] ?? []).contains(kAXPressAction) { break }
        guard let parent = attribute(target, kAXParentAttribute) else { break }
        target = parent as! AXUIElement; attempts += 1
    }
    output(["result": AXUIElementPerformAction(target, kAXPressAction as CFString).rawValue, "label": label(target)])
case "front": output(["pid": NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0])
case "type":
    var queue = [app], index = 0
    var field: AXUIElement?
    while index < queue.count && index < 10000 {
        let item = queue[index]; index += 1
        if attribute(item, kAXRoleAttribute) as? String == "AXTextArea" { field = item; break }
        queue.append(contentsOf: attribute(item, kAXChildrenAttribute) as? [AXUIElement] ?? [])
    }
    guard let field else { output(["missing": "text area"]); exit(3) }
    let result = AXUIElementSetAttributeValue(field, kAXValueAttribute as CFString, args[2] as CFString)
    output(["result": result.rawValue])
case "tree":
    var rows: [[String: String]] = [], queue = [app], index = 0
    while index < queue.count && index < 5000 {
        let item = queue[index]; index += 1
        let title = label(item)
        if !title.isEmpty { rows.append(["label": title, "role": attribute(item, kAXRoleAttribute) as? String ?? ""]) }
        queue.append(contentsOf: attribute(item, kAXChildrenAttribute) as? [AXUIElement] ?? [])
    }
    output(rows)
case "screen":
    let screen = NSScreen.screens[0], frame = screen.visibleFrame
    output(["x": frame.minX, "y": screen.frame.maxY - frame.maxY, "w": frame.width, "h": frame.height])
default: exit(1)
}
