/**
 * [INPUT]: AppKit 主窗口最小化/恢复、应用隐藏/恢复与显示器变更通知
 * [OUTPUT]: observe/stop 通知桥；把原生事实交给 sprite 的唯一形态模型
 * [POS]: Tauri 未暴露事件的窄适配；不替换系统 delegate，不观察失焦或遮挡
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
use std::cell::RefCell;
use objc2::{define_class, msg_send, sel, DefinedClass, MainThreadOnly};
use objc2::rc::Retained;
use objc2_app_kit::{NSWindow, NSWindowDidMiniaturizeNotification, NSWindowDidDeminiaturizeNotification,
    NSApplicationDidHideNotification, NSApplicationDidUnhideNotification, NSApplicationDidChangeScreenParametersNotification};
use objc2_foundation::{MainThreadMarker, NSNotification, NSNotificationCenter, NSObject, NSObjectProtocol};
use tauri::{AppHandle, Manager};
use crate::{sprite, sprite_model::Event};

struct ObserverIvars { app: AppHandle }

define_class!(
    // NSObject 无额外子类约束；观察者只在主线程存活。
    #[unsafe(super = NSObject)]
    #[thread_kind = MainThreadOnly]
    #[ivars = ObserverIvars]
    struct SpriteObserver;
    unsafe impl NSObjectProtocol for SpriteObserver {}
    impl SpriteObserver {
        #[unsafe(method(mainMiniaturized:))]
        fn miniaturized(&self, _: &NSNotification) { sprite::transition(&self.ivars().app, Event::Main(false)); }
        #[unsafe(method(mainRestored:))]
        fn restored(&self, _: &NSNotification) { sprite::transition(&self.ivars().app, Event::Main(true)); }
        #[unsafe(method(applicationHidden:))]
        fn hidden(&self, _: &NSNotification) { sprite::transition(&self.ivars().app, Event::AppHidden(true)); }
        #[unsafe(method(applicationUnhidden:))]
        fn unhidden(&self, _: &NSNotification) { sprite::transition(&self.ivars().app, Event::AppHidden(false)); }
        #[unsafe(method(screensChanged:))]
        fn screens_changed(&self, _: &NSNotification) { sprite::restore_position(&self.ivars().app); }
    }
);

thread_local! { static OBSERVER: RefCell<Option<Retained<SpriteObserver>>> = const { RefCell::new(None) }; }

pub fn observe(app: &AppHandle) {
    let marker = MainThreadMarker::new().expect("AppKit setup on main thread");
    let allocated = SpriteObserver::alloc(marker).set_ivars(ObserverIvars { app: app.clone() });
    // NSObject init 与已声明的通知选择器签名一致；注册期间由 thread_local 持有强引用。
    let observer: Retained<SpriteObserver> = unsafe { msg_send![super(allocated), init] };
    let main = app.get_webview_window("main").expect("main exists before observer");
    let pointer = main.ns_window().expect("AppKit window");
    let window = unsafe { &*pointer.cast::<NSWindow>() };
    let center = NSNotificationCenter::defaultCenter();
    unsafe {
        center.addObserver_selector_name_object(&observer, sel!(mainMiniaturized:), Some(NSWindowDidMiniaturizeNotification), Some(window));
        center.addObserver_selector_name_object(&observer, sel!(mainRestored:), Some(NSWindowDidDeminiaturizeNotification), Some(window));
        center.addObserver_selector_name_object(&observer, sel!(applicationHidden:), Some(NSApplicationDidHideNotification), None);
        center.addObserver_selector_name_object(&observer, sel!(applicationUnhidden:), Some(NSApplicationDidUnhideNotification), None);
        center.addObserver_selector_name_object(&observer, sel!(screensChanged:), Some(NSApplicationDidChangeScreenParametersNotification), None);
    }
    OBSERVER.with(|slot| *slot.borrow_mut() = Some(observer));
}

pub fn stop() {
    OBSERVER.with(|slot| {
        if let Some(observer) = slot.borrow_mut().take() {
            unsafe { NSNotificationCenter::defaultCenter().removeObserver(&observer) };
        }
    });
}
