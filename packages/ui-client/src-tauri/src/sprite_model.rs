/**
 * [INPUT]: 原生主窗口、最小化、应用隐藏与用户菜单事件
 * [OUTPUT]: Model 的纯状态转换、唯一可见形态与菜单动作映射
 * [POS]: 原生精灵生命周期的单一判定源；sprite.rs 执行动作，macOS 通知只提供事实
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Form { App, Desktop, Hidden }

#[derive(Clone, Copy, Debug)]
pub enum Event {
    Main(bool), AppHidden(bool), Enabled(bool), HideOnce, Quit,
}

#[derive(Debug)]
pub struct Model {
    pub main_visible: bool,
    pub app_hidden: bool,
    pub enabled: bool,
    pub suppressed: bool,
    pub exiting: bool,
}

impl Default for Model {
    fn default() -> Self {
        Self { main_visible: true, app_hidden: false, enabled: true, suppressed: false, exiting: false }
    }
}

impl Model {
    pub fn apply(&mut self, event: Event) -> Form {
        match event {
            Event::Main(visible) => {
                if visible != self.main_visible { self.suppressed = false; }
                self.main_visible = visible;
            }
            Event::AppHidden(hidden) => self.app_hidden = hidden,
            Event::Enabled(enabled) => self.enabled = enabled,
            Event::HideOnce => self.suppressed = true,
            Event::Quit => self.exiting = true,
        }
        self.form()
    }

    pub fn form(&self) -> Form {
        if self.exiting || self.app_hidden { return Form::Hidden; }
        if self.main_visible { return Form::App; }
        if self.enabled && !self.suppressed { Form::Desktop } else { Form::Hidden }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Action { Open, HideOnce, Quit }

pub fn menu_action(id: &str) -> Option<Action> {
    match id {
        "sprite-open" => Some(Action::Open),
        "sprite-hide-once" => Some(Action::HideOnce),
        "sprite-quit" => Some(Action::Quit),
        _ => None,
    }
}

// --- 逻辑坐标只在原生层换算；实际恢复与单测共用这一条路径 ---
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Position { pub x: f64, pub y: f64, pub monitor: String }
pub struct WorkArea { pub id: String, pub x: f64, pub y: f64, pub w: f64, pub h: f64, pub primary: bool }

pub fn position_in(saved: Option<&Position>, areas: &[WorkArea], width: f64, height: f64) -> Option<Position> {
    let remembered = saved.filter(|p| p.x.is_finite() && p.y.is_finite())
        .and_then(|p| areas.iter().find(|a| a.id == p.monitor).map(|a| (p, a)));
    let area = remembered.map(|(_, a)| a).or_else(|| areas.iter().find(|a| a.primary)).or_else(|| areas.first())?;
    let right = (area.x + area.w - width).max(area.x);
    let bottom = (area.y + area.h - height).max(area.y);
    Some(Position {
        x: remembered.map_or(right - 24.0, |(p, _)| p.x).clamp(area.x, right),
        y: remembered.map_or(bottom - 24.0, |(p, _)| p.y).clamp(area.y, bottom),
        monitor: area.id.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn position_memory_clamps_and_missing_monitor_returns_to_primary() {
        let areas = [WorkArea { id: "main".into(), x: 0.0, y: 25.0, w: 1440.0, h: 850.0, primary: true },
            WorkArea { id: "left".into(), x: -1280.0, y: 0.0, w: 1280.0, h: 800.0, primary: false }];
        let saved = Position { x: -900.0, y: 120.0, monitor: "left".into() };
        let restored = position_in(Some(&saved), &areas, 156.0, 238.0).unwrap();
        assert_eq!((restored.x, restored.y), (-900.0, 120.0));
        let outside = Position { x: -3000.0, y: 9999.0, ..saved.clone() };
        let clamped = position_in(Some(&outside), &areas, 156.0, 238.0).unwrap();
        assert_eq!((clamped.x, clamped.y), (-1280.0, 562.0));
        let fallback = position_in(Some(&saved), &areas[..1], 156.0, 238.0).unwrap();
        assert_eq!((fallback.x, fallback.y), (1260.0, 613.0));
        assert!(position_in(None, &[], 156.0, 238.0).is_none());
    }

    #[test]
    fn native_event_sequence_has_one_form() {
        let mut model = Model::default();
        assert_eq!(model.form(), Form::App);
        for event in [Event::Main(false), Event::Main(true), Event::Main(false), Event::Main(true)] {
            let expected = if matches!(event, Event::Main(true)) { Form::App } else { Form::Desktop };
            assert_eq!(model.apply(event), expected);
        }
        assert_eq!(model.apply(Event::HideOnce), Form::App);
        assert_eq!(model.apply(Event::Main(false)), Form::Desktop);
        assert_eq!(model.apply(Event::HideOnce), Form::Hidden);
        assert_eq!(model.apply(Event::Main(false)), Form::Hidden);
        assert_eq!(model.apply(Event::Main(true)), Form::App);
        assert_eq!(model.apply(Event::Main(false)), Form::Desktop);
        assert_eq!(model.apply(Event::Enabled(false)), Form::Hidden);
        assert_eq!(model.apply(Event::Enabled(true)), Form::Desktop);
        assert_eq!(model.apply(Event::AppHidden(true)), Form::Hidden);
        assert_eq!(model.apply(Event::AppHidden(false)), Form::Desktop);
        assert_eq!(model.apply(Event::Quit), Form::Hidden);
        assert_eq!(model.apply(Event::Main(true)), Form::Hidden);
    }

    #[test]
    fn cmd_h_never_releases_a_desktop_figure() {
        let mut model = Model::default();
        assert_eq!(model.apply(Event::AppHidden(true)), Form::Hidden);
        assert_eq!(model.apply(Event::Main(false)), Form::Hidden);
        assert_eq!(model.apply(Event::Main(true)), Form::Hidden);
        assert_eq!(model.apply(Event::AppHidden(false)), Form::App);
    }

    #[test]
    fn menu_ids_and_payloads_are_closed() {
        for (id, action) in [("sprite-open", Action::Open), ("sprite-hide-once", Action::HideOnce), ("sprite-quit", Action::Quit)] {
            assert_eq!(menu_action(id), Some(action));
        }
        assert_eq!(menu_action("quit-other"), None);
        assert!(serde_json::from_str::<Action>("\"invalid\"").is_err());
    }
}
