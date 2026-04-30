import { requestUrl } from 'obsidian';

export class CoverGenerator {
    static PROMPT_PRESETS: Record<string, string> = {
        notion: `请根据以下内容创作一张吸引眼球的小红书封面图。

文章标题：{标题}
内容摘要：{摘要}

请严格遵循以下规范：

【视觉风格】
- Notion 插画风格：扁平、卡通、带手绘质感与矢量感。
- 正方形构图 1:1，画面方正平衡。
- 色彩鲜明、对比强烈，在小尺寸预览时依然醒目。
- 风格统一，避免写实元素，整体保持手绘质感。
- 整体要像“爆款封面主视觉”，不是空洞的说明性配图。

【构图要求】
- 主视觉元素占画面约 70% 到 90%，镜头更近，主体更大，更有点击感。
- 尽量铺满画面，边缘也要有内容延伸，做成 full-bleed / edge-to-edge 的封面感。
- 可以采用居中、偏上、对角线或前景压近式构图，但不要让主体缩得很小。
- 加 1-2 个简洁但明确的视觉符号、图标、道具或人物剪影，增强记忆点。
- 允许有呼吸感，但不要出现大面积空白背景、空旷角落、边框感或“四周一圈留白”。
- 背景要有层次、渐变、纹理或辅助元素，避免只有单色底和一个小主体。

【封面表现】
- 优先做成高冲击力、高信息密度、缩略图里一眼能看懂主题的视觉。
- 主体和背景之间要有明显反差，可以适度夸张、放大、戏剧化。
- 可以加入代表“冲突 / 结果 / 机会 / 风险 / 反差”的视觉隐喻。
- 画面要更像小红书封面、YouTube thumbnail 或杂志封面主视觉，不是普通文章插图。

【文字处理（重要）】
- 画面内绝对不要出现任何可读文字、标题、字母、数字、标签、标语、水印、签名或 UI 界面文字。
- 标题会由程序在图片下方独立渲染，图里再出文字会和标题冲突。
- 如果需要表达“标题点缀文字”，请改成纯视觉元素，例如空白对话框、无字标牌、抽象符号。

【吸引力法则】
- 使用悬念、痛点、结果感、机会感等钩子元素激发点击欲望。
- 视觉元素可以夸张、有反差。
- 色彩搭配可参考爆款封面：橙黄 / 蓝紫 / 红黑等高对比组合。

【绝对禁止】
- 画面里的任何文字、字母、数字。
- 写实人脸、真人照片风格。
- 分格、分屏、拼贴、故事板。
- 品牌 logo、水印、签名。
- 白色边框、海报边框、拍立得边框、卡片边框、相框、四周留白。
- 一个很小的主体放在大面积纯色背景正中央。`
    };

    static extractExcerpt(markdown: string): string {
        let text = markdown || '';
        if (text.startsWith('---')) {
            const end = text.indexOf('\n---', 3);
            if (end > 0) text = text.slice(end + 4);
        }

        return text
            .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/[#>*`_~]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 280);
    }

    static buildImagePrompt(title: string, excerpt: string, settings: any): string {
        let template = '';
        if (settings?.coverPromptCustom?.trim()) {
            template = settings.coverPromptCustom.trim();
        } else {
            const presetKey = settings?.coverPromptPreset || 'notion';
            template = this.PROMPT_PRESETS[presetKey] || this.PROMPT_PRESETS.notion;
        }

        return template.replace(/\{标题\}/g, title).replace(/\{摘要\}/g, excerpt);
    }

    static async geminiGenerateImageBase64(apiKey: string, imageModel: string, prompt: string): Promise<string> {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(imageModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const res = await requestUrl({
            url,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    responseModalities: ['TEXT', 'IMAGE'],
                    imageConfig: { aspectRatio: '1:1' }
                }
            }),
            throw: false
        });

        let data: any = null;
        try {
            data = typeof res.json === 'object' && res.json !== null ? res.json : JSON.parse(res.text || '{}');
        } catch (_e) {
            data = {};
        }

        if (res.status !== 200 || data.error) {
            const msg = data.error?.message || res.text || (`HTTP ${res.status}`);
            console.error('[obsidian-note2red] Gemini image error', { status: res.status, body: data });
            throw new Error(msg);
        }

        const parts = data.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
            if (part.inlineData?.data) return part.inlineData.data;
            if (part.inline_data?.data) return part.inline_data.data;
        }

        const finish = data.candidates?.[0]?.finishReason;
        const safety = JSON.stringify(data.candidates?.[0]?.safetyRatings || []);
        throw new Error(`Gemini 未返回图片数据 (finishReason=${finish || '?'})。如是 SAFETY/PROHIBITED 请换主题或换画风，并确认模型在当前地区可用。${safety && safety.length > 2 ? ' safety=' + safety : ''}`);
    }
}
