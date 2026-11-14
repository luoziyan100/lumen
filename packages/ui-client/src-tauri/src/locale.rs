/**
 * [INPUT]: the UI's language id from the set_locale command (sent once at startup and on every change)
 * [OUTPUT]: set_locale; text(Text) for native dialog titles, the desktop sprite's window title and its menu items; English for unknown ids
 * [POS]: the shell's only language state. The UI catalogs own every other string; this table holds just what the system draws natively.
 *        Adding a language means one more arm per entry here and one catalog file in the UI
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
use std::sync::atomic::{AtomicU8, Ordering};
use tauri::{AppHandle, Manager};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Locale { En, Zh }

#[derive(Clone, Copy, Debug)]
pub enum Text { PickFolder, PickSkillFolder, PickSkillFile, SaveFile, SpriteWindow, SpriteOpen, SpriteHide, SpriteQuit }

static CURRENT: AtomicU8 = AtomicU8::new(0);

pub fn parse(id: &str) -> Locale { if id == "zh" { Locale::Zh } else { Locale::En } }

pub fn current() -> Locale { if CURRENT.load(Ordering::Relaxed) == 1 { Locale::Zh } else { Locale::En } }

fn store(locale: Locale) { CURRENT.store(if locale == Locale::Zh { 1 } else { 0 }, Ordering::Relaxed); }

pub fn text_in(locale: Locale, key: Text) -> &'static str {
    match (locale, key) {
        (Locale::En, Text::PickFolder) => "Choose a folder",
        (Locale::Zh, Text::PickFolder) => "选择项目源文件夹",
        (Locale::En, Text::PickSkillFolder) => "Choose a skill folder with SKILL.md",
        (Locale::Zh, Text::PickSkillFolder) => "选择包含 SKILL.md 的技能文件夹",
        (Locale::En, Text::PickSkillFile) => "Choose a skill Markdown file",
        (Locale::Zh, Text::PickSkillFile) => "选择技能 Markdown",
        (Locale::En, Text::SaveFile) => "Save a copy",
        (Locale::Zh, Text::SaveFile) => "保存到本机",
        (Locale::En, Text::SpriteWindow) => "Lumen sprite",
        (Locale::Zh, Text::SpriteWindow) => "Lumen 精灵",
        (Locale::En, Text::SpriteOpen) => "Open Lumen",
        (Locale::Zh, Text::SpriteOpen) => "打开 Lumen",
        (Locale::En, Text::SpriteHide) => "Hide for now",
        (Locale::Zh, Text::SpriteHide) => "这次先藏起来",
        (Locale::En, Text::SpriteQuit) => "Quit Lumen",
        (Locale::Zh, Text::SpriteQuit) => "退出 Lumen",
    }
}

pub fn text(key: Text) -> &'static str { text_in(current(), key) }

/// Dialogs and menus read the table when they open; an existing desktop sprite window gets its title updated here.
#[tauri::command]
pub fn set_locale(app: AppHandle, locale: String) {
    store(parse(&locale));
    if let Some(window) = app.get_webview_window(crate::sprite::LABEL) { let _ = window.set_title(text(Text::SpriteWindow)); }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_ids_fall_back_to_english() {
        assert_eq!(parse("zh"), Locale::Zh);
        for id in ["en", "", "fr", "zh-CN", "ZH"] { assert_eq!(parse(id), Locale::En, "{id}"); }
    }

    #[test]
    fn every_entry_has_both_languages() {
        let keys = [Text::PickFolder, Text::PickSkillFolder, Text::PickSkillFile, Text::SaveFile, Text::SpriteWindow, Text::SpriteOpen, Text::SpriteHide, Text::SpriteQuit];
        for key in keys {
            let (en, zh) = (text_in(Locale::En, key), text_in(Locale::Zh, key));
            assert!(!en.is_empty() && !zh.is_empty() && en != zh, "{key:?}");
            assert!(en.is_ascii(), "{key:?} English should be ASCII");
        }
        assert_eq!(text_in(Locale::En, Text::SaveFile), "Save a copy");
        assert_eq!(text_in(Locale::Zh, Text::SaveFile), "保存到本机");
    }

    #[test]
    fn the_stored_choice_is_what_dialogs_read() {
        store(Locale::Zh);
        assert_eq!(text(Text::PickSkillFolder), "选择包含 SKILL.md 的技能文件夹");
        store(parse("unknown"));
        assert_eq!(text(Text::PickSkillFolder), "Choose a skill folder with SKILL.md");
    }
}
