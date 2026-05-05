import { App } from 'obsidian';
import RedPlugin from './main';

type SplitResult = {
    fit: HTMLElement;
    rest: HTMLElement;
};

type PaginationOptions = {
    overflowStrategy?: 'paginate' | 'scale' | 'native';
};

export class RedConverter {
    private static app: App;
    private static plugin: RedPlugin;
    private static pendingSources?: WeakMap<HTMLElement, Element[]>;

    static initialize(app: App, plugin: RedPlugin) {
        this.app = app;
        this.plugin = plugin;
    }

    static hasValidContent(element: HTMLElement): boolean {
        if (element.querySelector('.red-preview-container')) return true;
        if (element.querySelector('.red-empty-message')) return false;

        for (const child of Array.from(element.children)) {
            if (child.classList && child.classList.contains('red-empty-message')) continue;
            return true;
        }

        return !!(element.textContent && element.textContent.trim().length > 0);
    }

    static formatContent(element: HTMLElement): void {
        let sourceRoot = element;
        while (
            sourceRoot.children.length === 1 &&
            /^(DIV|SECTION|ARTICLE|MAIN)$/.test(sourceRoot.children[0].tagName) &&
            sourceRoot.children[0].children.length > 0
        ) {
            sourceRoot = sourceRoot.children[0] as HTMLElement;
        }

        const sourceElements = Array.from(sourceRoot.children).map(el => el.cloneNode(true) as Element);
        const hasAny = sourceElements.length > 0 && sourceElements.some(el => {
            const txt = (el.textContent || '').trim();
            return txt.length > 0 || !!el.querySelector('img, svg, video, iframe, table, hr, pre, code');
        });

        if (!hasAny) {
            element.empty();
            element.createEl('div', {
                cls: 'red-empty-message',
                text: `⚠️ 温馨提示
                        请在文档中添加任意内容
                        内容将自动按页面大小分页生成图片
                        如需手动换页，在希望分页处插入 ---`
            });
            element.dispatchEvent(new CustomEvent('content-validation-change', {
                detail: { isValid: false },
                bubbles: true
            }));
            return;
        }

        element.dispatchEvent(new CustomEvent('content-validation-change', {
            detail: { isValid: true },
            bubbles: true
        }));

        const previewContainer = document.createElement('div');
        previewContainer.className = 'red-preview-container';

        const imagePreview = document.createElement('div');
        imagePreview.className = 'red-image-preview';

        const copyButton = document.createElement('button');
        copyButton.className = 'red-copy-button';
        copyButton.innerHTML = '<?xml version="1.0" encoding="UTF-8"?><svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 12.4316V7.8125C13 6.2592 14.2592 5 15.8125 5H40.1875C41.7408 5 43 6.2592 43 7.8125V32.1875C43 33.7408 41.7408 35 40.1875 35H35.5163" stroke="#9b9b9b" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M32.1875 13H7.8125C6.2592 13 5 14.2592 5 15.8125V40.1875C5 41.7408 6.2592 43 7.8125 43H32.1875C33.7408 43 35 41.7408 35 40.1875V15.8125C35 14.2592 33.7408 13 32.1875 13Z" fill="none" stroke="#9b9b9b" stroke-width="4" stroke-linejoin="round"/></svg>';
        copyButton.title = '复制图片';
        copyButton.setAttribute('aria-label', '复制图片到剪贴板');
        previewContainer.appendChild(copyButton);

        const headerArea = document.createElement('div');
        headerArea.className = 'red-preview-header';

        const contentArea = document.createElement('div');
        contentArea.className = 'red-preview-content';

        const footerArea = document.createElement('div');
        footerArea.className = 'red-preview-footer';

        const contentContainer = document.createElement('div');
        contentContainer.className = 'red-content-container';

        const placeholderSection = document.createElement('section');
        placeholderSection.className = 'red-content-section';
        placeholderSection.setAttribute('data-index', '0');
        contentContainer.appendChild(placeholderSection);

        contentArea.appendChild(contentContainer);
        imagePreview.appendChild(headerArea);
        imagePreview.appendChild(contentArea);
        imagePreview.appendChild(footerArea);
        previewContainer.appendChild(imagePreview);

        element.empty();
        element.appendChild(previewContainer);

        if (!RedConverter.pendingSources) {
            RedConverter.pendingSources = new WeakMap();
        }
        RedConverter.pendingSources.set(element, sourceElements);

        element.dispatchEvent(new CustomEvent('copy-button-added', {
            detail: { copyButton },
            bubbles: true
        }));
    }

    private static splitTable(el: HTMLElement, measurer: HTMLElement, maxHeight: number): SplitResult | null {
        const theadOrig = el.querySelector(':scope > thead');
        const tbodyOrig = el.querySelector(':scope > tbody');
        let headTrs: Element[] = [];
        let bodyTrs: Element[] = [];

        if (theadOrig) {
            headTrs = Array.from(theadOrig.querySelectorAll(':scope > tr'));
            bodyTrs = tbodyOrig
                ? Array.from(tbodyOrig.querySelectorAll(':scope > tr'))
                : Array.from(el.querySelectorAll(':scope > tr'));
        } else {
            const allTrs = tbodyOrig
                ? Array.from(tbodyOrig.querySelectorAll(':scope > tr'))
                : Array.from(el.querySelectorAll(':scope > tr'));
            if (allTrs.length < 2) return null;
            headTrs = [allTrs[0]];
            bodyTrs = allTrs.slice(1);
        }

        if (bodyTrs.length < 2) return null;

        const fit = el.cloneNode(false) as HTMLElement;
        const fitThead = document.createElement('thead');
        headTrs.forEach(tr => fitThead.appendChild(tr.cloneNode(true)));
        fit.appendChild(fitThead);
        const fitTbody = document.createElement('tbody');
        fit.appendChild(fitTbody);

        measurer.appendChild(fit);
        if (measurer.scrollHeight > maxHeight) {
            measurer.removeChild(fit);
            return null;
        }

        let fitCount = 0;
        for (let i = 0; i < bodyTrs.length; i++) {
            const trClone = bodyTrs[i].cloneNode(true);
            fitTbody.appendChild(trClone);
            if (measurer.scrollHeight > maxHeight) {
                fitTbody.removeChild(trClone);
                break;
            }
            fitCount = i + 1;
        }
        measurer.removeChild(fit);

        if (fitCount <= 0 || fitCount >= bodyTrs.length) return null;

        const rest = el.cloneNode(false) as HTMLElement;
        const restThead = document.createElement('thead');
        headTrs.forEach(tr => restThead.appendChild(tr.cloneNode(true)));
        rest.appendChild(restThead);
        const restTbody = document.createElement('tbody');
        for (let i = fitCount; i < bodyTrs.length; i++) {
            restTbody.appendChild(bodyTrs[i].cloneNode(true));
        }
        rest.appendChild(restTbody);

        return { fit, rest };
    }

    private static splitPre(el: HTMLElement, measurer: HTMLElement, maxHeight: number): SplitResult | null {
        const codeEl = el.querySelector('code');
        const hasSvgContent = (codeEl && codeEl.querySelector(':scope > svg')) || el.querySelector(':scope > svg');
        if (hasSvgContent) return null;

        const source = codeEl || el;
        const text = source.textContent || '';
        const lines = text.split('\n');
        if (lines.length < 2) return null;

        const fit = el.cloneNode(false) as HTMLElement;
        let target: HTMLElement;
        if (codeEl) {
            const fitCode = codeEl.cloneNode(false) as HTMLElement;
            fit.appendChild(fitCode);
            target = fitCode;
        } else {
            target = fit;
        }

        measurer.appendChild(fit);
        let lo = 1;
        let hi = lines.length - 1;
        let best = 0;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            target.textContent = lines.slice(0, mid).join('\n');
            if (measurer.scrollHeight <= maxHeight) {
                best = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        measurer.removeChild(fit);

        if (best <= 0) return null;
        target.textContent = lines.slice(0, best).join('\n');

        const rest = el.cloneNode(false) as HTMLElement;
        if (codeEl) {
            const restCode = codeEl.cloneNode(false) as HTMLElement;
            restCode.textContent = lines.slice(best).join('\n');
            rest.appendChild(restCode);
        } else {
            rest.textContent = lines.slice(best).join('\n');
        }

        return { fit, rest };
    }

    private static makeScaledWrap(el: HTMLElement, measurer: HTMLElement, maxHeight: number): HTMLElement | null {
        const saved = Array.from(measurer.childNodes);
        saved.forEach(n => measurer.removeChild(n));
        measurer.appendChild(el);
        const rawHeight = measurer.scrollHeight;
        measurer.removeChild(el);
        saved.forEach(n => measurer.appendChild(n));

        if (!isFinite(rawHeight) || rawHeight <= 0 || rawHeight <= maxHeight) return null;

        const scale = maxHeight / rawHeight;
        const wrap = document.createElement('div');
        wrap.className = 'red-scale-wrap';
        wrap.style.height = `${maxHeight}px`;

        const inner = document.createElement('div');
        inner.className = 'red-scale-inner';
        inner.style.transform = `scale(${scale})`;
        inner.style.transformOrigin = 'top center';
        inner.appendChild(el);
        wrap.appendChild(inner);

        return wrap;
    }

    private static splitBlock(el: HTMLElement, measurer: HTMLElement, maxHeight: number): SplitResult | null {
        const TEXT_TAGS = ['P', 'LI', 'BLOCKQUOTE', 'FIGCAPTION'];
        const LIST_TAGS = ['UL', 'OL'];
        const tag = el.tagName;
        const isText = TEXT_TAGS.includes(tag);
        const isList = LIST_TAGS.includes(tag);

        if (tag === 'TABLE') return RedConverter.splitTable(el, measurer, maxHeight);
        if (tag === 'PRE') return RedConverter.splitPre(el, measurer, maxHeight);
        if (!isText && !isList) return null;

        const fit = el.cloneNode(false) as HTMLElement;
        const rest = el.cloneNode(false) as HTMLElement;
        measurer.appendChild(fit);

        const children = Array.from(el.childNodes);
        let handled = false;
        let consumedListItems = 0;

        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const cloned = child.cloneNode(true);
            fit.appendChild(cloned);

            if (measurer.scrollHeight <= maxHeight) {
                if (isList && child.nodeType === Node.ELEMENT_NODE) consumedListItems++;
                continue;
            }

            fit.removeChild(cloned);

            if (isText && child.nodeType === Node.TEXT_NODE) {
                const text = child.nodeValue || '';
                const probe = document.createTextNode('');
                fit.appendChild(probe);
                let lo = 0;
                let hi = text.length;
                let best = 0;

                while (lo <= hi) {
                    const mid = (lo + hi) >> 1;
                    probe.nodeValue = text.slice(0, mid);
                    if (measurer.scrollHeight <= maxHeight) {
                        best = mid;
                        lo = mid + 1;
                    } else {
                        hi = mid - 1;
                    }
                }

                if (best > 0) {
                    let splitAt = best;
                    const LEAD_BAD = /[\u3002\uFF01\uFF1F\uFF1B\uFF0C\u3001\uFF1A\u2026.!?;,:\u201D\u2019\u300D\u300F\uFF09\u300B\u3009\u3011"'\)\]\}]/;
                    const isBadLead = (ch?: string) => ch != null && (LEAD_BAD.test(ch) || /\s/.test(ch));
                    let tryAt = splitAt;

                    while (tryAt < text.length && isBadLead(text[tryAt])) tryAt++;
                    if (tryAt > splitAt) {
                        probe.nodeValue = text.slice(0, tryAt);
                        if (measurer.scrollHeight <= maxHeight) splitAt = tryAt;
                    }

                    if (splitAt < text.length && LEAD_BAD.test(text[splitAt])) {
                        let back = splitAt - 1;
                        let guard = 5;
                        while (back > 0 && LEAD_BAD.test(text[back]) && guard-- > 0) back--;
                        if (back > 0) splitAt = back;
                    }

                    probe.nodeValue = text.slice(0, splitAt);
                    const restText = text.slice(splitAt);
                    if (restText.length > 0) rest.appendChild(document.createTextNode(restText));
                } else {
                    fit.removeChild(probe);
                    rest.appendChild(child.cloneNode(true));
                }
            } else if (tag === 'BLOCKQUOTE' && child.nodeType === Node.ELEMENT_NODE) {
                const childEl = child as HTMLElement;
                const childTag = childEl.tagName;
                const splitChild = childTag === 'TABLE'
                    ? RedConverter.splitTable(childEl, measurer, maxHeight)
                    : childTag === 'PRE'
                        ? RedConverter.splitPre(childEl, measurer, maxHeight)
                        : null;

                if (splitChild) {
                    fit.appendChild(splitChild.fit);
                    rest.appendChild(splitChild.rest);
                } else {
                    const hasIntro = fit.childNodes.length > 0 ||
                        ((fit.textContent || '').trim() !== '');
                    const hasPageContentBeforeFit = Array.from(measurer.children).some(node => node !== fit);
                    if (hasIntro && hasPageContentBeforeFit && (childTag === 'TABLE' || childTag === 'PRE')) {
                        measurer.removeChild(fit);
                        return null;
                    }
                    rest.appendChild(child.cloneNode(true));
                }
            } else {
                rest.appendChild(child.cloneNode(true));
            }

            for (let j = i + 1; j < children.length; j++) {
                rest.appendChild(children[j].cloneNode(true));
            }
            handled = true;
            break;
        }

        measurer.removeChild(fit);
        if (!handled) return null;

        const fitEmpty = fit.childNodes.length === 0 ||
            ((fit.textContent || '').trim() === '' && !fit.querySelector('img,svg,video,iframe,table,code,pre'));
        const restEmpty = rest.childNodes.length === 0;
        if (fitEmpty || restEmpty) return null;

        if (isList && tag === 'OL') {
            const origStart = parseInt(el.getAttribute('start') || '1', 10) || 1;
            rest.setAttribute('start', String(origStart + consumedListItems));
        }

        return { fit, rest };
    }

    static paginateContent(element: HTMLElement, options: PaginationOptions = {}): void {
        const raw = options.overflowStrategy;
        const overflowStrategy = raw === 'scale' || raw === 'native' ? raw : 'paginate';
        const map = RedConverter.pendingSources;
        if (!map) return;

        const sources = map.get(element);
        if (!sources) return;
        map.delete(element);

        const contentContainer = element.querySelector<HTMLElement>('.red-content-container');
        const contentArea = element.querySelector<HTMLElement>('.red-preview-content');
        const imagePreview = element.querySelector<HTMLElement>('.red-image-preview');
        const headerEl = element.querySelector<HTMLElement>('.red-preview-header');
        const footerEl = element.querySelector<HTMLElement>('.red-preview-footer');
        if (!contentContainer || !contentArea || !imagePreview) return;

        const imgStyle = window.getComputedStyle(imagePreview);
        const padTop = parseFloat(imgStyle.paddingTop) || 0;
        const padBot = parseFloat(imgStyle.paddingBottom) || 0;
        const imgInnerHeight = imagePreview.clientHeight - padTop - padBot;
        const headerH = headerEl ? headerEl.offsetHeight : 0;
        const footerH = footerEl ? footerEl.offsetHeight : 0;
        const SAFETY = 6;
        let maxHeight = imgInnerHeight - headerH - footerH - SAFETY;
        if (!isFinite(maxHeight) || maxHeight <= 0) maxHeight = 460;

        while (contentContainer.firstChild) contentContainer.removeChild(contentContainer.firstChild);

        const measurer = document.createElement('section');
        measurer.className = 'red-content-section';
        measurer.style.display = 'block';
        measurer.style.position = 'absolute';
        measurer.style.visibility = 'hidden';
        measurer.style.top = '0';
        measurer.style.left = '0';
        measurer.style.right = '0';
        measurer.style.pointerEvents = 'none';

        const prevPosition = contentContainer.style.position;
        contentContainer.style.position = prevPosition || 'relative';
        contentContainer.appendChild(measurer);

        const pages: HTMLElement[][] = [[]];
        let currentPage = 0;
        const queue = sources.slice() as HTMLElement[];
        let guard = 0;
        const GUARD_MAX = queue.length * 50 + 500;

        while (queue.length > 0) {
            if (++guard > GUARD_MAX) break;
            const el = queue.shift();
            if (!el) break;

            if (el.tagName === 'HR') {
                if (pages[currentPage].length > 0) {
                    currentPage++;
                    pages[currentPage] = [];
                    measurer.innerHTML = '';
                }
                continue;
            }

            measurer.appendChild(el);
            const overflow = measurer.scrollHeight > maxHeight;
            if (!overflow) {
                pages[currentPage].push(el);
                continue;
            }

            measurer.removeChild(el);
            const isPreOrTable = el.tagName === 'PRE' || el.tagName === 'TABLE';
            const isNative = overflowStrategy === 'native';
            const MIN_REMAIN = 80;

            const tryScaleFit = () => {
                const used = measurer.scrollHeight;
                const remain = maxHeight - used;
                let targetMax: number;

                if (used > 0 && remain >= MIN_REMAIN) {
                    targetMax = remain;
                } else {
                    if (pages[currentPage].length > 0) {
                        currentPage++;
                        pages[currentPage] = [];
                        measurer.innerHTML = '';
                    }
                    targetMax = maxHeight;
                }

                const scaled = RedConverter.makeScaledWrap(el, measurer, targetMax);
                if (scaled) {
                    pages[currentPage].push(scaled);
                    measurer.appendChild(scaled);
                    return true;
                }
                return false;
            };

            if (overflowStrategy === 'scale' && isPreOrTable) {
                if (tryScaleFit()) continue;
            }

            if (!(isNative && isPreOrTable)) {
                const split = RedConverter.splitBlock(el, measurer, maxHeight);
                if (split) {
                    pages[currentPage].push(split.fit);
                    currentPage++;
                    pages[currentPage] = [];
                    measurer.innerHTML = '';
                    queue.unshift(split.rest);
                    continue;
                }
            }

            if (!isNative && isPreOrTable) {
                if (tryScaleFit()) continue;
            }

            if (pages[currentPage].length > 0) {
                currentPage++;
                pages[currentPage] = [el];
                measurer.innerHTML = '';
                measurer.appendChild(el);
            } else {
                pages[currentPage].push(el);
                measurer.appendChild(el);
            }
        }

        if (measurer.parentNode) measurer.parentNode.removeChild(measurer);
        contentContainer.style.position = prevPosition;

        const realPages = pages.filter(p => p.length > 0);
        if (realPages.length === 0) {
            const section = document.createElement('section');
            section.className = 'red-content-section';
            section.setAttribute('data-index', '0');
            contentContainer.appendChild(section);
        } else {
            realPages.forEach((pageEls, pageIdx) => {
                const section = document.createElement('section');
                section.className = 'red-content-section';
                section.setAttribute('data-index', String(pageIdx));
                pageEls.forEach(el => section.appendChild(el));
                this.processElements(section);
                contentContainer.appendChild(section);
            });
        }

        element.dispatchEvent(new CustomEvent('pagination-complete', {
            detail: { pageCount: realPages.length },
            bubbles: true
        }));
    }

    private static processElements(container: HTMLElement | null): void {
        if (!container) return;

        container.querySelectorAll('strong, em').forEach(el => {
            el.classList.add('red-emphasis');
        });

        container.querySelectorAll('a').forEach(el => {
            el.classList.add('red-link');
        });

        container.querySelectorAll('table').forEach(el => {
            if (el === container.closest('table')) return;
            el.classList.add('red-table');
        });

        container.querySelectorAll('hr').forEach(el => {
            el.classList.add('red-hr');
        });

        container.querySelectorAll('del').forEach(el => {
            el.classList.add('red-del');
        });

        container.querySelectorAll('.task-list-item').forEach(el => {
            el.classList.add('red-task-list-item');
        });

        container.querySelectorAll('.footnote-ref, .footnote-backref').forEach(el => {
            el.classList.add('red-footnote');
        });

        container.querySelectorAll('pre code').forEach(el => {
            const pre = el.parentElement;
            if (pre) {
                pre.classList.add('red-pre');

                const dots = document.createElement('div');
                dots.className = 'red-code-dots';

                ['red', 'yellow', 'green'].forEach(color => {
                    const dot = document.createElement('span');
                    dot.className = `red-code-dot red-code-dot-${color}`;
                    dots.appendChild(dot);
                });

                pre.insertBefore(dots, pre.firstChild);

                const copyButton = pre.querySelector('.copy-code-button');
                if (copyButton) {
                    copyButton.remove();
                }
            }
        });

        container.querySelectorAll('span.internal-embed[alt][src]').forEach(async el => {
            const originalSpan = el as HTMLElement;
            const src = originalSpan.getAttribute('src');
            const alt = originalSpan.getAttribute('alt');

            if (!src) return;

            try {
                const linktext = src.split('|')[0];
                const file = this.app.metadataCache.getFirstLinkpathDest(linktext, '');
                if (file) {
                    const absolutePath = this.app.vault.adapter.getResourcePath(file.path);
                    const newImg = document.createElement('img');
                    newImg.src = absolutePath;
                    if (alt) newImg.alt = alt;
                    newImg.className = 'red-image';
                    originalSpan.parentNode?.replaceChild(newImg, originalSpan);
                }
            } catch (error) {
                console.error('图片处理失败:', error);
            }
        });

        container.querySelectorAll('blockquote').forEach(el => {
            el.classList.add('red-blockquote');
            el.querySelectorAll('p').forEach(p => {
                p.classList.add('red-blockquote-p');
            });
        });
    }
}
