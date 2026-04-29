import { requestUrl } from 'obsidian';

export class CoverGenerator {
    static PROMPT_PRESETS: Record<string, string> = {
        notion: `请根据以下内容创作一张吸引眼球的小红书封面图。

文章标题：{标题}
内容摘要：{摘要}

视觉风格：Notion 插画风格，扁平、卡通、带手绘质感与矢量感；正方形构图 1:1；色彩鲜明、对比强烈。
构图要求：主体占画面约 70% 到 90%，镜头更近，尽量铺满画面，边缘也要有内容延伸，像小红书封面或 YouTube thumbnail。
文字处理：画面内绝对不要出现任何可读文字、标题、字母、数字、标签、水印、签名或 UI 界面文字。标题会由程序在图片下方独立渲染。
禁止：写实人脸、真人照片风格、品牌 logo、水印、白色边框、海报边框、拍立得边框、四周留白、一个很小的主体放在大面积纯色背景中央。`
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
        throw new Error(`Gemini 未返回图片数据 (finishReason=${finish || '?'}).${safety && safety.length > 2 ? ' safety=' + safety : ''}`);
    }
}
