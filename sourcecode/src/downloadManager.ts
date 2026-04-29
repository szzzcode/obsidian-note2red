import * as htmlToImage from 'html-to-image';
import JSZip from 'jszip';

export class DownloadManager {
    private static getExportConfig(imageElement: HTMLElement) {
        return {
            quality: 1,
            pixelRatio: 4,
            skipFonts: false,
            filter: (_node: Node) => true,
            imagePlaceholder: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
        };
    }

    private static sanitizeFileName(name?: string): string {
        return (name || '小红书笔记')
            .replace(/\.md$/i, '')
            .replace(/[\\/:*?"<>|]/g, '_')
            .replace(/\s+/g, ' ')
            .trim() || '小红书笔记';
    }

    private static getBaseFileName(element: HTMLElement): string {
        return this.sanitizeFileName(element?.dataset.noteTitle);
    }

    private static formatTimestamp(date = new Date()): string {
        const pad = (value: number) => String(value).padStart(2, '0');
        return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
    }

    private static formatPageLabel(index: number, total: number, isCover: boolean): string {
        if (isCover) return '封面';
        const digits = Math.max(2, String(Math.max(total, 1)).length);
        return `第${String(index + 1).padStart(digits, '0')}页`;
    }

    private static buildImageFileName(element: HTMLElement, suffix: string, timestamp: string): string {
        return `${this.getBaseFileName(element)}_${suffix}_${timestamp}.png`;
    }

    private static buildZipFileName(element: HTMLElement, totalPages: number, timestamp: string): string {
        return `${this.getBaseFileName(element)}_全部${totalPages}页_${timestamp}.zip`;
    }

    static async downloadAllImages(element: HTMLElement): Promise<void> {
        try {
            const zip = new JSZip();
            const previewContainer = element.querySelector('.red-preview-container');
            if (!previewContainer) throw new Error('找不到预览容器');

            const VISIBLE_CLASS = 'red-section-visible';
            const HIDDEN_CLASS = 'red-section-hidden';
            const sections = previewContainer.querySelectorAll<HTMLElement>('.red-content-section');
            const totalSections = sections.length;
            const exportTimestamp = this.formatTimestamp();

            const originalVisibility = Array.from(sections).map(section => ({
                visible: section.classList.contains(VISIBLE_CLASS),
                hidden: section.classList.contains(HIDDEN_CLASS)
            }));
            const imagePreviewEl = element.querySelector<HTMLElement>('.red-image-preview');
            const originalCoverFlag = imagePreviewEl ? imagePreviewEl.classList.contains('red-image-preview--cover-active') : false;

            for (let i = 0; i < totalSections; i++) {
                sections.forEach(section => {
                    section.classList.add(HIDDEN_CLASS);
                    section.classList.remove(VISIBLE_CLASS);
                });

                sections[i].classList.remove(HIDDEN_CLASS);
                sections[i].classList.add(VISIBLE_CLASS);

                if (imagePreviewEl) {
                    imagePreviewEl.classList.toggle(
                        'red-image-preview--cover-active',
                        sections[i].classList.contains('red-cover-section')
                    );
                }

                await new Promise(resolve => setTimeout(resolve, 300));

                const imageElement = element.querySelector<HTMLElement>('.red-image-preview')!;
                const pageLabel = this.formatPageLabel(i, totalSections, sections[i].classList.contains('red-cover-section'));
                const entryName = `${this.getBaseFileName(element)}_${pageLabel}.png`;

                try {
                    const blob = await htmlToImage.toBlob(imageElement, this.getExportConfig(imageElement));
                    if (blob instanceof Blob) {
                        zip.file(entryName, blob);
                    } else {
                        throw new Error('生成的不是有效的 Blob 对象');
                    }
                } catch (err) {
                    console.warn(`第${i + 1}页导出失败，尝试备用方法`, err);
                    try {
                        const canvas = await htmlToImage.toCanvas(imageElement, this.getExportConfig(imageElement));
                        const blob = await new Promise<Blob>((resolve, reject) => {
                            canvas.toBlob((b) => {
                                if (b) {
                                    resolve(b);
                                } else {
                                    reject(new Error('Canvas 转换为 Blob 失败'));
                                }
                            }, 'image/png', 1);
                        });
                        zip.file(entryName, blob);
                    } catch (canvasErr) {
                        console.error(`第${i + 1}页备用导出也失败`, canvasErr);
                    }
                }
            }

            sections.forEach((section, index) => {
                section.classList.toggle(VISIBLE_CLASS, originalVisibility[index].visible);
                section.classList.toggle(HIDDEN_CLASS, originalVisibility[index].hidden);
            });
            if (imagePreviewEl) {
                imagePreviewEl.classList.toggle('red-image-preview--cover-active', originalCoverFlag);
            }

            const content = await zip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: {
                    level: 9
                }
            });

            if (!(content instanceof Blob)) {
                throw new Error('生成的压缩文件不是有效的 Blob 对象');
            }

            const url = URL.createObjectURL(content);
            const link = Object.assign(document.createElement('a'), {
                href: url,
                download: this.buildZipFileName(element, totalSections, exportTimestamp)
            });

            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('导出图片失败:', error);
            throw error;
        }
    }

    static async downloadSingleImage(element: HTMLElement): Promise<void> {
        try {
            const imageElement = element.querySelector<HTMLElement>('.red-image-preview');
            if (!imageElement) {
                throw new Error('找不到预览区域');
            }

            const sections = element.querySelectorAll<HTMLElement>('.red-content-section');
            const activeSection = element.querySelector<HTMLElement>('.red-content-section.red-section-active') || sections[0];
            const activeIndex = Math.max(0, Array.from(sections).indexOf(activeSection));
            const pageLabel = this.formatPageLabel(
                activeIndex,
                sections.length,
                !!(activeSection && activeSection.classList.contains('red-cover-section'))
            );
            const exportTimestamp = this.formatTimestamp();
            const fileName = this.buildImageFileName(element, pageLabel, exportTimestamp);

            await new Promise(resolve => setTimeout(resolve, 300));

            try {
                const blob = await htmlToImage.toBlob(imageElement, this.getExportConfig(imageElement));
                if (!blob) throw new Error('Blob 对象为空');
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = fileName;

                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            } catch (err) {
                console.warn('导出失败，尝试备用方法', err);
                const canvas = await htmlToImage.toCanvas(imageElement, this.getExportConfig(imageElement));
                canvas.toBlob((blob) => {
                    if (!blob) {
                        throw new Error('Canvas 转换为 Blob 失败');
                    }
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = fileName;

                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                }, 'image/png', 1);
            }
        } catch (error) {
            console.error('导出图片失败:', error);
            throw error;
        }
    }

    static async downloadLongImage(element: HTMLElement): Promise<void> {
        try {
            const previewContainer = element.querySelector('.red-preview-container');
            if (!previewContainer) throw new Error('找不到预览容器');

            const VISIBLE_CLASS = 'red-section-visible';
            const HIDDEN_CLASS = 'red-section-hidden';
            const sections = previewContainer.querySelectorAll<HTMLElement>('.red-content-section');
            const totalSections = sections.length;
            if (totalSections === 0) throw new Error('没有可导出的页');

            const exportTimestamp = this.formatTimestamp();
            const originalVisibility = Array.from(sections).map(section => ({
                visible: section.classList.contains(VISIBLE_CLASS),
                hidden: section.classList.contains(HIDDEN_CLASS)
            }));
            const imagePreviewEl = element.querySelector<HTMLElement>('.red-image-preview');
            const originalCoverFlag = imagePreviewEl ? imagePreviewEl.classList.contains('red-image-preview--cover-active') : false;
            const canvases: HTMLCanvasElement[] = [];

            for (let i = 0; i < totalSections; i++) {
                sections.forEach(section => {
                    section.classList.add(HIDDEN_CLASS);
                    section.classList.remove(VISIBLE_CLASS);
                });

                sections[i].classList.remove(HIDDEN_CLASS);
                sections[i].classList.add(VISIBLE_CLASS);

                if (imagePreviewEl) {
                    imagePreviewEl.classList.toggle(
                        'red-image-preview--cover-active',
                        sections[i].classList.contains('red-cover-section')
                    );
                }

                await new Promise(resolve => setTimeout(resolve, 300));

                const imageElement = element.querySelector<HTMLElement>('.red-image-preview')!;
                const canvas = await htmlToImage.toCanvas(imageElement, this.getExportConfig(imageElement));
                canvases.push(canvas);
            }

            sections.forEach((section, index) => {
                section.classList.toggle(VISIBLE_CLASS, originalVisibility[index].visible);
                section.classList.toggle(HIDDEN_CLASS, originalVisibility[index].hidden);
            });
            if (imagePreviewEl) {
                imagePreviewEl.classList.toggle('red-image-preview--cover-active', originalCoverFlag);
            }

            const width = canvases[0].width;
            const totalHeight = canvases.reduce((sum, c) => sum + c.height, 0);
            const MAX_CANVAS_SIDE = 16384;
            if (totalHeight > MAX_CANVAS_SIDE) {
                console.warn(`长图高度 ${totalHeight}px 超过浏览器建议上限 ${MAX_CANVAS_SIDE}px，可能导致截断或失败`);
            }

            const big = document.createElement('canvas');
            big.width = width;
            big.height = totalHeight;
            const ctx = big.getContext('2d');
            if (!ctx) throw new Error('无法创建 Canvas 绘图上下文');

            let y = 0;
            for (const c of canvases) {
                ctx.drawImage(c, 0, y);
                y += c.height;
            }

            const blob = await new Promise<Blob>((resolve, reject) => {
                big.toBlob(
                    b => b ? resolve(b) : reject(new Error('Canvas 转换为 Blob 失败')),
                    'image/png',
                    1
                );
            });

            const url = URL.createObjectURL(blob);
            const link = Object.assign(document.createElement('a'), {
                href: url,
                download: this.buildImageFileName(element, `长图_${totalSections}页`, exportTimestamp)
            });

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('导出长图失败:', error);
            throw error;
        }
    }
}
