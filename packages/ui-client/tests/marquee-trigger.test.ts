/**
 * [INPUT]: React SSR;Kumo DropdownMenu
 * [OUTPUT]: 断言闲置会话(无 sb-dot)时 Trigger 仍渲染 button.sb-item > .sb-marquee
 * [POS]: 锁住跑马灯第一性原理前提——单子节点不得被提升为 Trigger 本体
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DropdownMenu } from '@cloudflare/kumo/components/dropdown'

describe('sidebar task Trigger DOM', () => {
  it('keeps MarqueeTitle inside explicit button when it is the only child', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        'div',
        { className: 'sb-item-row' },
        React.createElement(
          DropdownMenu,
          { open: false, onOpenChange() {} },
          React.createElement(
            DropdownMenu.Trigger,
            {
              render: React.createElement('button', { type: 'button', className: 'sb-item' }),
              onClick(e: { preventDefault(): void }) {
                e.preventDefault()
              },
            },
            React.createElement(
              'span',
              { className: 'sb-marquee sb-item-title' },
              React.createElement('span', { className: 'sb-marquee-text' }, '很长的会话标题用于溢出'),
            ),
          ),
        ),
      ),
    )

    assert.match(html, /<button[^>]*class="sb-item"/)
    assert.match(html, /sb-item"[^>]*>[\s\S]*sb-marquee/)
    assert.doesNotMatch(html, /<div class="sb-item-row"><span class="sb-marquee/)
  })
})
