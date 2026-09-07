from playwright.sync_api import sync_playwright

def test_ability_cards():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto('http://localhost:8765/index.html')
        page.wait_for_load_state('networkidle')

        errors = []
        success = []

        # 1. Verify home page loads
        try:
            title = page.title()
            assert "我的工作台" in title, f"Expected '我的工作台' in title, got '{title}'"
            success.append(f"首页标题正确: {title}")
        except AssertionError as e:
            errors.append(str(e))

        # 2. Verify all 6 ability cards exist
        expected_cards = [
            ("AI 智能回复", "ai"),
            ("群聊 @ 应答", "group"),
            ("记忆学习", "mem"),
            ("向量召回", "recall"),
            ("多类型消息", "msg"),
            ("Token 用量", "usage"),
        ]

        for card_name, page_key in expected_cards:
            try:
                # Look for card text
                card = page.locator(f".capi:has-text('{card_name}')")
                assert card.count() > 0, f"Ability card not found: {card_name}"
                success.append(f"✓ 找到能力卡: {card_name}")
            except AssertionError as e:
                errors.append(str(e))

        # 3. Test clicking each card and verifying the independent page
        page_tests = [
            ("AI 智能回复", "ai", "连续上下文对话 · 私聊直接应答"),
            ("群聊 @ 应答", "group", "群里 @机器人 才响应，不打扰"),
            ("记忆学习", "mem", "发『记住 事项』即写入长期记忪"),
            ("向量召回", "recall", "提问时自动检索相关记忆注入上下文"),
            ("多类型消息", "msg", "识别文本/图片/语音/视频/表情/链接/小程序"),
            ("Token 用量", "usage", "用量总览 · 近7天趋势 · 每用户排行"),
        ]

        for card_name, page_key, expected_sub in page_tests:
            try:
                # Navigate home first
                page.evaluate("() => { window.location.href = 'http://localhost:8765/index.html'; }")
                page.wait_for_load_state('networkidle')
                page.wait_for_selector(".cap-link", timeout=5000)

                # Click the card
                card = page.locator(f".capi:has-text('{card_name}')")
                card.click()

                # Wait for page to render
                page.wait_for_selector("#bot-back", timeout=5000)
                page.wait_for_timeout(500)

                # Verify subtext
                sub_text = page.locator("#topSub").text_content()
                assert expected_sub in sub_text, f"Expected '{expected_sub}' in subtitle, got '{sub_text}'"
                success.append(f"✓ {card_name} 页面跳转成功，副标题: {sub_text}")
            except Exception as e:
                errors.append(f"{card_name} 页面测试失败: {str(e)}")

        # 4. Test back button from last page
        try:
            back_btn = page.locator("#bot-back")
            assert back_btn.count() > 0, "Back button not found"
            back_btn.click()
            page.wait_for_timeout(500)
            home_title = page.locator(".greet h1").text_content()
            assert home_title in ["微信机器人", "AI 智能回复"], f"Expected home page title after back"
            success.append("✓ 返回按钮工作正常")
        except Exception as e:
            errors.append(f"返回按钮测试失败: {str(e)}")

        # 5. Test memory page delete functionality (if data exists)
        try:
            # Go to memory page
            page.goto('http://localhost:8765/index.html')
            page.wait_for_load_state('networkidle')
            page.wait_for_selector(".cap-link", timeout=5000)
            card = page.locator(".capi:has-text('记忆学习')")
            card.click()
            page.wait_for_selector("#bot-back", timeout=5000)
            page.wait_for_timeout(500)

            # Check if delete buttons exist
            del_buttons = page.locator(".js-mem-del")
            if del_buttons.count() > 0:
                success.append(f"✓ 记忆页面有 {del_buttons.count()} 个删除按钮")
            else:
                success.append("ℹ 记忆页面暂无数据（暂无删除按钮）")
        except Exception as e:
            errors.append(f"记忆页面删除功能测试失败: {str(e)}")

        # 6. Test usage page elements
        try:
            page.goto('http://localhost:8765/index.html')
            page.wait_for_load_state('networkidle')
            page.wait_for_selector(".cap-link", timeout=5000)
            card = page.locator(".capi:has-text('Token 用量')")
            card.click()
            page.wait_for_selector("#bot-back", timeout=5000)
            page.wait_for_timeout(500)

            # Verify usage page elements
            assert page.locator("#v-calls").count() > 0, "v-calls not found"
            assert page.locator("#v-in").count() > 0, "v-in not found"
            assert page.locator("#v-out").count() > 0, "v-out not found"
            assert page.locator("#v-total").count() > 0, "v-total not found"
            assert page.locator("#w-rank").count() > 0, "w-rank not found"
            assert page.locator("#w-trend").count() > 0, "w-trend not found"
            success.append("✓ 用量页面包含: 总览 + 趋势 + 排行")
        except Exception as e:
            errors.append(f"用量页面元素测试失败: {str(e)}")

        # 7. Test msg page type tags
        try:
            page.goto('http://localhost:8765/index.html')
            page.wait_for_load_state('networkidle')
            page.wait_for_selector(".cap-link", timeout=5000)
            card = page.locator(".capi:has-text('多类型消息')")
            card.click()
            page.wait_for_selector("#bot-back", timeout=5000)
            page.wait_for_timeout(500)

            type_tags = page.locator(".msg-types span")
            tag_texts = [type_tags.nth(i).text_content() for i in range(type_tags.count())]
            expected_types = ["文本", "图片", "语音", "视频", "表情", "链接", "小程序"]
            for t in expected_types:
                assert t in tag_texts, f"Expected type tag '{t}' not found"
            success.append(f"✓ 多类型消息页面包含类型标签条: {', '.join(tag_texts)}")
        except Exception as e:
            errors.append(f"多类型消息标签测试失败: {str(e)}")

        browser.close()

        print("\n=== 测试结果 ===\n")
        print(f"✅ 成功: {len(success)}")
        for s in success:
            print(s)
        print(f"\n❌ 失败: {len(errors)}")
        for e in errors:
            print(e)
        print(f"\n总计: {len(success)} 成功, {len(errors)} 失败")

        return len(errors) == 0

if __name__ == "__main__":
    test_ability_cards()
