import { ItemView, WorkspaceLeaf, MarkdownRenderer, TFile, Notice, setIcon } from 'obsidian';
import { RedConverter } from './converter';
import { DownloadManager } from './downloadManager';
import type { ThemeManager } from './themeManager';
import { DonateManager } from './donateManager';
import type { SettingsManager } from './settings/settings';
import { ClipboardManager } from './clipboardManager';
import { ImgTemplateManager } from './imgTemplateManager';
import { BackgroundSettingModal } from './modals/BackgroundSettingModal';
import { BackgroundManager } from './backgroundManager';
import { CoverGenerator } from './coverGenerator';
export const VIEW_TYPE_RED = 'obsidian-note2red';

export class RedView extends ItemView {
    // #region 属性定义
    private previewEl: HTMLElement;
    private currentFile: TFile | null = null;
    private updateTimer: number | null = null;
    private isPreviewLocked: boolean = false;
    private currentImageIndex: number = 0;
    private backgroundManager: BackgroundManager;
    // 添加捐赠提醒相关属性
    private donateCount: number = 0;
    private lastDonatePrompt: number = 0;
    private MAX_COUNT_BEFORE_PROMPT: number = 5; // 每使用5次提醒一次

    // UI 元素
    private lockButton: HTMLButtonElement;
    private copyButton: HTMLButtonElement;
    private coverGenButton: HTMLButtonElement;
    private headerToggleButton: HTMLButtonElement;
    private footerToggleButton: HTMLButtonElement;
    private customTemplateSelect: HTMLElement;
    private customThemeSelect: HTMLElement;
    private customFontSelect: HTMLElement;
    private customOverflowSelect: HTMLElement;
    private fontSizeSelect: HTMLInputElement;
    private navigationButtons: {
        prev: HTMLButtonElement;
        next: HTMLButtonElement;
        indicator: HTMLElement;
    } | undefined;

    // 管理器实例
    private themeManager: ThemeManager;
    private settingsManager: SettingsManager;
    private imgTemplateManager: ImgTemplateManager;
    // #endregion

    // #region 基础视图方法
    constructor(
        leaf: WorkspaceLeaf,
        themeManager: ThemeManager,
        settingsManager: SettingsManager
    ) {
        super(leaf);
        this.themeManager = themeManager;
        this.settingsManager = settingsManager;
        this.backgroundManager = new BackgroundManager();
        this.imgTemplateManager = new ImgTemplateManager(
            this.settingsManager,
            this.updatePreview.bind(this),
            this.themeManager
        );

        // 从设置中恢复捐赠计数和上次提示时间
        const settings = this.settingsManager.getSettings();
        this.donateCount = settings.donateCount || 0;
        this.lastDonatePrompt = settings.lastDonatePrompt || 0;
    }

    getViewType() {
        return VIEW_TYPE_RED;
    }

    getDisplayText() {
        return '小红书预览';
    }

    getIcon() {
        return 'image';
    }
    // #endregion

    // #region 视图初始化
    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.className = 'red-view-content';

        await this.initializeToolbar(container as HTMLElement);
        this.initializePreviewArea(container as HTMLElement);
        this.initializeBottomBar(container as HTMLElement);
        this.initializeEventListeners();

        const currentFile = this.app.workspace.getActiveFile();
        await this.onFileOpen(currentFile);
    }

    private async initializeToolbar(container: HTMLElement) {
        const toolbar = container.createEl('div', { cls: 'red-toolbar' });
        const controlsGroup = toolbar.createEl('div', { cls: 'red-controls-group' });

        await this.initializeLockButton(controlsGroup);
        await this.initializeChromeToggles(controlsGroup);
        await this.initializeThemeSelect(controlsGroup);
        await this.initializeFontSelect(controlsGroup);
        await this.initializeFontSizeControls(controlsGroup);
        await this.initializeOverflowStrategySelect(controlsGroup);
        await this.restoreSettings();
    }

    private async initializeOverflowStrategySelect(parent: HTMLElement) {
        this.customOverflowSelect = this.createCustomSelect(
            parent,
            'red-overflow-select',
            [
                { value: 'paginate', label: '切分' },
                { value: 'scale', label: '缩放' },
                { value: 'native', label: '换页' }
            ]
        );
        this.customOverflowSelect.id = 'overflow-select';

        this.customOverflowSelect.querySelector('.red-select')?.addEventListener('change', async (e: any) => {
            const value = e.detail.value;
            await this.settingsManager.updateSettings({ overflowStrategy: value });
            await this.updatePreview();
        });
    }

    // 添加背景设置按钮初始化方法
    private async initializeBackgroundButton(parent: HTMLElement) {
        const bgButton = parent.createEl('button', {
            cls: 'red-background-button',
            attr: { 'aria-label': '设置背景图片' }
        });
        setIcon(bgButton, 'image');

        bgButton.addEventListener('click', () => {
            const currentSettings = this.settingsManager.getSettings().backgroundSettings;
            new BackgroundSettingModal(
                this.app,
                async (backgroundSettings) => {
                    await this.settingsManager.updateSettings({ backgroundSettings });
                    const imagePreview = this.previewEl.querySelector('.red-image-preview') as HTMLElement;
                    this.backgroundManager.applyBackgroundStyles(
                        imagePreview,
                        backgroundSettings
                    );
                },
                this.previewEl,
                this.backgroundManager,
                currentSettings
            ).open();
        });
    }

    private initializePreviewArea(container: HTMLElement) {
        const wrapper = container.createEl('div', { cls: 'red-preview-wrapper' });
        this.previewEl = wrapper.createEl('div', { cls: 'red-preview-container' });

        // 创建导航容器
        const navContainer = wrapper.createEl('div', { cls: 'red-nav-container' });

        const prevButton = navContainer.createEl('button', {
            cls: 'red-nav-button',
            text: '←'
        });

        const indicator = navContainer.createEl('span', {
            cls: 'red-page-indicator',
            text: '1/1'
        });

        const nextButton = navContainer.createEl('button', {
            cls: 'red-nav-button',
            text: '→'
        });

        this.navigationButtons = { prev: prevButton, next: nextButton, indicator };

        prevButton.addEventListener('click', () => this.navigateImages('prev'));
        nextButton.addEventListener('click', () => this.navigateImages('next'));
    }

    private updateNavigationState() {
        const sections = this.previewEl.querySelectorAll('.red-content-section');
        if (!this.navigationButtons) return;

        sections.forEach((section, i) => {
            (section as HTMLElement).classList.toggle('red-section-active', i === this.currentImageIndex);
        });

        this.navigationButtons.prev.classList.toggle('red-nav-hidden', this.currentImageIndex === 0);
        this.navigationButtons.next.classList.toggle('red-nav-hidden', this.currentImageIndex === sections.length - 1);
        this.navigationButtons.indicator.textContent = `${this.currentImageIndex + 1}/${sections.length}`;
        RedView.syncCoverActiveFlag(this.previewEl);
    }

    private navigateImages(direction: 'prev' | 'next') {
        const sections = this.previewEl.querySelectorAll('.red-content-section');
        if (direction === 'prev' && this.currentImageIndex > 0) {
            this.currentImageIndex--;
        } else if (direction === 'next' && this.currentImageIndex < sections.length - 1) {
            this.currentImageIndex++;
        }
        this.updateNavigationState();
    }

    private initializeBottomBar(container: HTMLElement) {
        const bottomBar = container.createEl('div', { cls: 'red-bottom-bar' });
        const bottomControlsGroup = bottomBar.createEl('div', { cls: 'red-controls-group' });

        this.initializeHelpButton(bottomControlsGroup);
        this.initializeCoverButton(bottomControlsGroup);
        this.initializeBackgroundButton(bottomControlsGroup);
        this.initializeDonateButton(bottomControlsGroup);
        this.initializeExportButtons(bottomControlsGroup);
    }

    private initializeEventListeners() {
        this.registerEvent(
            this.app.workspace.on('file-open', this.onFileOpen.bind(this))
        );
        this.registerEvent(
            this.app.vault.on('modify', this.onFileModify.bind(this))
        );
        this.initializeCopyButtonListener();
    }
    // #endregion

    // #region 控件初始化
    private async initializeLockButton(parent: HTMLElement) {
        this.lockButton = parent.createEl('button', {
            cls: 'red-lock-button',
            attr: { 'aria-label': '关闭实时预览状态' }
        });
        setIcon(this.lockButton, 'lock');
        this.lockButton.addEventListener('click', () => this.togglePreviewLock());
    }

    private async initializeChromeToggles(parent: HTMLElement) {
        const group = parent.createEl('div', { cls: 'red-chrome-toggle-group' });
        this.headerToggleButton = group.createEl('button', {
            cls: 'red-chrome-toggle-button',
            attr: {
                'aria-label': '显示或隐藏页眉',
                title: '页眉'
            }
        });
        this.headerToggleButton.createEl('span', { cls: 'red-chrome-toggle-glyph', text: '眉' });

        this.footerToggleButton = group.createEl('button', {
            cls: 'red-chrome-toggle-button',
            attr: {
                'aria-label': '显示或隐藏页脚',
                title: '页脚'
            }
        });
        this.footerToggleButton.createEl('span', { cls: 'red-chrome-toggle-glyph', text: '脚' });

        this.headerToggleButton.addEventListener('click', async () => {
            const settings = this.settingsManager.getSettings();
            const next = settings.showHeader !== true;
            this.imgTemplateManager.setCurrentTemplate('default');
            await this.settingsManager.updateSettings({ templateId: 'default', showHeader: next });
            this.syncChromeToggleButtons();
            await this.updatePreview();
        });

        this.footerToggleButton.addEventListener('click', async () => {
            const settings = this.settingsManager.getSettings();
            const next = settings.showFooter === false;
            this.imgTemplateManager.setCurrentTemplate('default');
            await this.settingsManager.updateSettings({ templateId: 'default', showFooter: next });
            this.syncChromeToggleButtons();
            await this.updatePreview();
        });

        this.syncChromeToggleButtons();
    }

    private async initializeTemplateSelect(parent: HTMLElement) {
        this.customTemplateSelect = this.createCustomSelect(
            parent,
            'red-template-select',
            await this.getTemplateOptions()
        );
        this.customTemplateSelect.id = 'template-select';

        this.customTemplateSelect.querySelector('.red-select')?.addEventListener('change', async (e: any) => {
            const value = e.detail.value;
            this.imgTemplateManager.setCurrentTemplate(value);
            await this.settingsManager.updateSettings({ templateId: value });
            this.imgTemplateManager.applyTemplate(this.previewEl, this.settingsManager.getSettings());
            await this.updatePreview();
        });
    }

    private async initializeThemeSelect(parent: HTMLElement) {
        this.customThemeSelect = this.createCustomSelect(
            parent,
            'red-theme-select',
            await this.getThemeOptions()
        );
        this.customThemeSelect.id = 'theme-select';

        this.customThemeSelect.querySelector('.red-select')?.addEventListener('change', async (e: any) => {
            const value = e.detail.value;
            this.themeManager.setCurrentTheme(value);
            await this.settingsManager.updateSettings({ themeId: value });
            this.themeManager.applyTheme(this.previewEl);
        });
    }

    private async initializeFontSelect(parent: HTMLElement) {
        this.customFontSelect = this.createCustomSelect(
            parent,
            'red-font-select',
            this.getFontOptions()
        );
        this.customFontSelect.id = 'font-select';

        this.customFontSelect.querySelector('.red-select')?.addEventListener('change', async (e: any) => {
            const value = e.detail.value;
            this.themeManager.setFont(value);
            await this.settingsManager.updateSettings({ fontFamily: value });
            this.themeManager.applyTheme(this.previewEl);
        });
    }

    private async initializeFontSizeControls(parent: HTMLElement) {
        const fontSizeGroup = parent.createEl('div', { cls: 'red-font-size-group' });

        const decreaseButton = fontSizeGroup.createEl('button', {
            cls: 'red-font-size-btn',
            text: '-'
        });

        this.fontSizeSelect = fontSizeGroup.createEl('input', {
            cls: 'red-font-size-input',
            type: 'text',
            value: '16',
            attr: {
                style: 'border: none; outline: none; background: transparent;'
            }
        });

        const increaseButton = fontSizeGroup.createEl('button', {
            cls: 'red-font-size-btn',
            text: '+'
        });

        const updateFontSize = async () => {
            const size = parseInt(this.fontSizeSelect.value);
            this.themeManager.setFontSize(size);
            await this.settingsManager.updateSettings({ fontSize: size });
            this.themeManager.applyTheme(this.previewEl);
        };

        decreaseButton.addEventListener('click', () => {
            const currentSize = parseInt(this.fontSizeSelect.value);
            if (currentSize > 12) {
                this.fontSizeSelect.value = (currentSize - 1).toString();
                updateFontSize();
            }
        });

        increaseButton.addEventListener('click', () => {
            const currentSize = parseInt(this.fontSizeSelect.value);
            if (currentSize < 30) {
                this.fontSizeSelect.value = (currentSize + 1).toString();
                updateFontSize();
            }
        });

        this.fontSizeSelect.addEventListener('change', updateFontSize);
    }

    private initializeHelpButton(parent: HTMLElement) {
        const helpButton = parent.createEl('button', {
            cls: 'red-help-button',
            attr: { 'aria-label': '使用指南' }
        });
        setIcon(helpButton, 'help');
        parent.createEl('div', {
            cls: 'red-help-tooltip',
            text: `使用指南：
                1. 打开一篇 Markdown 笔记后，插件会按图片高度自动分页，不再要求用标题拆分。
                2. 想在指定位置换页时，在正文中单独插入 --- 分隔线。
                3. 顶部可切换主题、字体、字号，以及表格/代码块溢出策略：切分、缩放、换页。
                4. “眉 / 脚”按钮可快速显示或隐藏页眉、页脚，让正文区域更大。
                5. 需要首图时，可开启封面页；也可以手动上传封面图或用 Gemini 生成封面。
                6. 导出当前页用于单张调整，导出全部页用于批量生成，导出长图用于连续阅读。
                7. 锁按钮用于暂停或恢复实时预览；解锁时编辑笔记会自动刷新预览。
                8. 关于作者中可以查看作者信息与后续关注方式。`
        });
    }

    private initializeDonateButton(parent: HTMLElement) {
        const likeButton = parent.createEl('button', { cls: 'red-like-button' });
        likeButton.createEl('span', {
            text: '❤️',
            attr: { style: 'margin-right: 4px' }
        });
        likeButton.createSpan({ text: '关于作者' });
        likeButton.addEventListener('click', () => {
            DonateManager.showDonateModal(this.containerEl);
        });
    }

    private initializeCoverButton(parent: HTMLElement) {
        this.coverGenButton = parent.createEl('button', {
            cls: 'red-cover-gen-button',
            text: '生成封面'
        });
        this.coverGenButton.addEventListener('click', () => this.onGenerateCoverClick());
    }

    private initializeExportButtons(parent: HTMLElement) {
        // 单张下载按钮
        const singleDownloadButton = parent.createEl('button', {
            text: '下载当前页',
            cls: 'red-export-button'
        });

        singleDownloadButton.addEventListener('click', async () => {
            if (this.previewEl) {
                // 检查是否需要显示捐赠弹窗
                if (this.shouldShowDonatePrompt()) {
                    DonateManager.showDonateModal(this.containerEl);
                }

                singleDownloadButton.disabled = true;
                singleDownloadButton.setText('导出中...');

                try {
                    await DownloadManager.downloadSingleImage(this.previewEl);
                    singleDownloadButton.setText('导出成功');
                } catch (error) {
                    singleDownloadButton.setText('导出失败');
                } finally {
                    setTimeout(() => {
                        singleDownloadButton.disabled = false;
                        singleDownloadButton.setText('下载当前页');
                    }, 2000);
                }
            }
        });

        // 批量导出按钮
        this.copyButton = parent.createEl('button', {
            text: '导出全部页',
            cls: 'red-export-button'
        });

        this.copyButton.addEventListener('click', async () => {
            if (this.previewEl) {
                // 检查是否需要显示捐赠弹窗
                if (this.shouldShowDonatePrompt()) {
                    DonateManager.showDonateModal(this.containerEl);
                }

                this.copyButton.disabled = true;
                this.copyButton.setText('导出中...');

                try {
                    await DownloadManager.downloadAllImages(this.previewEl);
                    this.copyButton.setText('导出成功');
                } catch (error) {
                    this.copyButton.setText('导出失败');
                } finally {
                    setTimeout(() => {
                        this.copyButton.disabled = false;
                        this.copyButton.setText('导出全部页');
                    }, 2000);
                }
            }
        });

        const longImageButton = parent.createEl('button', {
            text: '导出长图',
            cls: 'red-export-button'
        });

        longImageButton.addEventListener('click', async () => {
            if (this.previewEl) {
                if (this.shouldShowDonatePrompt()) {
                    DonateManager.showDonateModal(this.containerEl);
                }

                longImageButton.disabled = true;
                longImageButton.setText('导出中...');

                try {
                    await DownloadManager.downloadLongImage(this.previewEl);
                    longImageButton.setText('导出成功');
                } catch (error) {
                    longImageButton.setText('导出失败');
                } finally {
                    setTimeout(() => {
                        longImageButton.disabled = false;
                        longImageButton.setText('导出长图');
                    }, 2000);
                }
            }
        });
    }

    private initializeCopyButtonListener() {
        const copyButtonHandler = async (e: CustomEvent) => {
            const { copyButton } = e.detail;
            if (copyButton) {
                copyButton.addEventListener('click', async () => {
                    copyButton.disabled = true;
                    try {
                        // 检查是否需要显示捐赠弹窗
                        if (this.shouldShowDonatePrompt()) {
                            DonateManager.showDonateModal(this.containerEl);
                        }

                        await ClipboardManager.copyImageToClipboard(this.previewEl);
                        new Notice('图片已复制到剪贴板');
                    } catch (error) {
                        new Notice('复制失败');
                        console.error('复制图片失败:', error);
                    } finally {
                        setTimeout(() => {
                            copyButton.disabled = false;
                        }, 1000);
                    }
                });
            }
        };

        this.containerEl.addEventListener('copy-button-added', copyButtonHandler as EventListener);
        this.register(() => {
            this.containerEl.removeEventListener('copy-button-added', copyButtonHandler as EventListener);
        });
    }
    // #endregion

    // #region 设置管理
    private async restoreSettings() {
        const settings = this.settingsManager.getSettings();

        if (settings.themeId) {
            await this.restoreThemeSettings(settings.themeId);
        }
        if (settings.fontFamily) {
            await this.restoreFontSettings(settings.fontFamily);
        }
        if (settings.fontSize) {
            this.fontSizeSelect.value = settings.fontSize.toString();
            this.themeManager.setFontSize(settings.fontSize);
        }
        this.imgTemplateManager.setCurrentTemplate('default');
        this.syncChromeToggleButtons();
        if (settings.overflowStrategy) {
            this.restoreOverflowStrategy(settings.overflowStrategy);
        }
    }

    syncChromeToggleButtons() {
        const settings = this.settingsManager.getSettings();
        const headerActive = settings.showHeader === true;
        const footerActive = settings.showFooter !== false;
        if (this.headerToggleButton) {
            this.headerToggleButton.classList.toggle('is-active', headerActive);
            this.headerToggleButton.setAttribute('aria-pressed', String(headerActive));
        }
        if (this.footerToggleButton) {
            this.footerToggleButton.classList.toggle('is-active', footerActive);
            this.footerToggleButton.setAttribute('aria-pressed', String(footerActive));
        }
    }

    private restoreOverflowStrategy(strategy: string) {
        if (!this.customOverflowSelect) return;
        const text = this.customOverflowSelect.querySelector('.red-select-text');
        const dropdown = this.customOverflowSelect.querySelector('.red-select-dropdown');
        const label = strategy === 'scale' ? '缩放' : strategy === 'native' ? '换页' : '切分';
        if (text) text.textContent = label;
        this.customOverflowSelect.querySelector('.red-select')?.setAttribute('data-value', strategy);
        if (dropdown) {
            dropdown.querySelectorAll('.red-select-item').forEach(el => {
                if (el.getAttribute('data-value') === strategy) {
                    el.classList.add('red-selected');
                } else {
                    el.classList.remove('red-selected');
                }
            });
        }
    }

    private async restoreTemplateSettings(templateId: string) {
        const templateSelect = this.customTemplateSelect.querySelector('.red-select-text');
        const templateDropdown = this.customTemplateSelect.querySelector('.red-select-dropdown');
        if (templateSelect && templateDropdown) {
            const option = await this.getTemplateOptions();
            const selected = option.find(o => o.value === templateId);
            if (selected) {
                templateSelect.textContent = selected.label;
                this.customTemplateSelect.querySelector('.red-select')?.setAttribute('data-value', selected.value);
                templateDropdown.querySelectorAll('.red-select-item').forEach(el => {
                    if (el.getAttribute('data-value') === selected.value) {
                        el.classList.add('red-selected');
                    } else {
                        el.classList.remove('red-selected');
                    }
                });
            }
        }
        this.imgTemplateManager.setCurrentTemplate(templateId);
    }

    private async restoreThemeSettings(themeId: string) {
        const templateSelect = this.customThemeSelect.querySelector('.red-select-text');
        const templateDropdown = this.customThemeSelect.querySelector('.red-select-dropdown');
        if (templateSelect && templateDropdown) {
            const option = await this.getThemeOptions();
            const selected = option.find(o => o.value === themeId);
            if (selected) {
                templateSelect.textContent = selected.label;
                this.customThemeSelect.querySelector('.red-select')?.setAttribute('data-value', selected.value);
                templateDropdown.querySelectorAll('.red-select-item').forEach(el => {
                    if (el.getAttribute('data-value') === selected.value) {
                        el.classList.add('red-selected');
                    } else {
                        el.classList.remove('red-selected');
                    }
                });
            }
        }
        this.themeManager.setCurrentTheme(themeId);
    }

    private async restoreFontSettings(fontFamily: string) {
        const fontSelect = this.customFontSelect.querySelector('.red-select-text');
        const fontDropdown = this.customFontSelect.querySelector('.red-select-dropdown');
        if (fontSelect && fontDropdown) {
            const option = this.getFontOptions();
            const selected = option.find(o => o.value === fontFamily);
            if (selected) {
                fontSelect.textContent = selected.label;
                this.customFontSelect.querySelector('.red-select')?.setAttribute('data-value', selected.value);
                fontDropdown.querySelectorAll('.red-select-item').forEach(el => {
                    if (el.getAttribute('data-value') === selected.value) {
                        el.classList.add('red-selected');
                    } else {
                        el.classList.remove('red-selected');
                    }
                });
            }
        }
        this.themeManager.setFont(fontFamily);
    }
    // #endregion

    // #region 预览更新
    private async updatePreview() {
        if (!this.currentFile) return;
        this.previewEl.empty();
        this.previewEl.dataset.noteTitle = this.currentFile.basename.replace(/\.md$/i, '');
        this.previewEl.dataset.notePath = this.currentFile.path;

        const content = await this.app.vault.cachedRead(this.currentFile);
        await MarkdownRenderer.render(
            this.app,
            content,
            this.previewEl,
            this.currentFile.path,
            this
        );

        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        this.themeManager.applyTheme(this.previewEl);
        RedConverter.formatContent(this.previewEl);
        const hasValidContent = RedConverter.hasValidContent(this.previewEl);

        if (hasValidContent) {
            // 应用当前模板
            this.imgTemplateManager.applyTemplate(this.previewEl, this.settingsManager.getSettings());
            this.themeManager.applyTheme(this.previewEl);
            await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
            RedConverter.paginateContent(this.previewEl, {
                overflowStrategy: this.settingsManager.getSettings().overflowStrategy
            });
            this.themeManager.applyTheme(this.previewEl);
            await this.syncCoverPage();
            this.themeManager.applyTheme(this.previewEl);
            // 应用当前背景设置
            const settings = this.settingsManager.getSettings();
            if (settings.backgroundSettings.imageUrl) {
                const previewContainer = this.previewEl.querySelector('.red-image-preview');
                if (previewContainer) {
                    this.backgroundManager.applyBackgroundStyles(previewContainer as HTMLElement, settings.backgroundSettings);
                }
            }
        }

        this.updateControlsState(hasValidContent);
        if (!hasValidContent) {
            this.copyButton.setAttribute('title', '请先添加正文内容');
        } else {
            this.copyButton.removeAttribute('title');
        }
        this.updateNavigationState();
    }

    private renumberSectionIndices() {
        const sections = this.previewEl.querySelectorAll('.red-content-section');
        sections.forEach((section, index) => section.setAttribute('data-index', String(index)));
    }

    private buildCoverPageInner(title: string, imgUrl: string, excerpt: string): HTMLElement {
        const settings = this.settingsManager.getSettings();
        const layout = settings.coverLayout || 'image-top';
        const wrap = document.createElement('div');
        wrap.className = `red-cover-page${layout === 'title-top' ? ' red-cover-page--title-top' : ''}`;
        const coverFont = settings.coverTitleFont || '';

        if (layout === 'title-top') {
            const tWrap = document.createElement('div');
            tWrap.className = 'red-cover-title-wrap red-cover-title-wrap--top';
            const h = document.createElement('h2');
            h.className = 'red-cover-title red-cover-title--top';
            h.textContent = title;
            if (coverFont) h.style.fontFamily = coverFont;
            tWrap.appendChild(h);
            wrap.appendChild(tWrap);

            const imgWrap = document.createElement('div');
            imgWrap.className = 'red-cover-image-wrap red-cover-image-wrap--small';
            if (imgUrl) {
                const img = document.createElement('img');
                img.className = 'red-cover-image';
                img.src = imgUrl;
                img.alt = '';
                imgWrap.appendChild(img);
            } else {
                const ph = document.createElement('div');
                ph.className = 'red-cover-placeholder';
                ph.textContent = '暂无封面图 - 设置中可上传图片或点本按钮生成';
                imgWrap.appendChild(ph);
            }
            wrap.appendChild(imgWrap);

            if (settings.coverShowExcerpt !== false) {
                const eWrap = document.createElement('div');
                eWrap.className = 'red-cover-excerpt-wrap';
                const eText = document.createElement('p');
                eText.className = 'red-cover-excerpt';
                eText.contentEditable = 'true';
                eText.setAttribute('data-placeholder', '点击输入封面摘要...');
                const excerptText = (settings.coverExcerptText || '').trim();
                if (excerptText) eText.textContent = excerptText;
                const sm = this.settingsManager;
                eText.addEventListener('blur', async () => {
                    const val = (eText.textContent || '').trim();
                    await sm.updateSettings({ coverExcerptText: val });
                });
                eText.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        eText.blur();
                    }
                });
                eWrap.appendChild(eText);
                wrap.appendChild(eWrap);
            }
        } else {
            const imgWrap = document.createElement('div');
            imgWrap.className = 'red-cover-image-wrap';
            if (imgUrl) {
                const img = document.createElement('img');
                img.className = 'red-cover-image';
                img.src = imgUrl;
                img.alt = '';
                imgWrap.appendChild(img);
            } else {
                const ph = document.createElement('div');
                ph.className = 'red-cover-placeholder';
                ph.textContent = '暂无封面图 - 设置中可上传图片或点本按钮生成';
                imgWrap.appendChild(ph);
            }

            const tWrap = document.createElement('div');
            tWrap.className = 'red-cover-title-wrap';
            const h = document.createElement('h2');
            h.className = 'red-cover-title';
            h.textContent = title;
            if (coverFont) h.style.fontFamily = coverFont;
            tWrap.appendChild(h);

            wrap.appendChild(imgWrap);
            wrap.appendChild(tWrap);
        }

        return wrap;
    }

    private async syncCoverPage() {
        const container = this.previewEl.querySelector('.red-content-container');
        if (!container || !this.currentFile) return;
        container.querySelectorAll('.red-cover-section').forEach(el => el.remove());

        const settings = this.settingsManager.getSettings();
        if (!settings.coverEnabled) {
            this.renumberSectionIndices();
            this.updateNavigationState();
            return;
        }

        const title = this.currentFile.basename.replace(/\.md$/i, '');
        const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_');
        let imgUrl = '';
        const manual = (settings.coverManualImagePath || '').trim();

        if (manual) {
            const file = this.app.vault.getAbstractFileByPath(manual);
            if (file && 'extension' in file && /^(png|jpe?g|gif|webp|avif|bmp)$/i.test((file as any).extension)) {
                imgUrl = this.app.vault.adapter.getResourcePath((file as any).path);
            }
        } else {
            const folder = (settings.coverSaveFolder || '99_attachments/note-to-red-covers').replace(/\/+$/, '');
            const cachePath = `${folder}/generated-${safeTitle}.png`;
            const cached = this.app.vault.getAbstractFileByPath(cachePath);
            if (cached && 'extension' in cached) {
                imgUrl = this.app.vault.adapter.getResourcePath((cached as any).path);
            } else {
                const legacyPath = `_note-to-red-covers/generated-${safeTitle}.png`;
                const legacy = this.app.vault.getAbstractFileByPath(legacyPath);
                if (legacy && 'extension' in legacy) {
                    imgUrl = this.app.vault.adapter.getResourcePath((legacy as any).path);
                }
            }
        }

        let excerpt = '';
        try {
            const content = await this.app.vault.cachedRead(this.currentFile);
            excerpt = CoverGenerator.extractExcerpt(content);
        } catch (_e) {}

        const section = document.createElement('section');
        section.className = 'red-content-section red-cover-section';
        section.appendChild(this.buildCoverPageInner(title, imgUrl, excerpt));
        container.insertBefore(section, container.firstChild);
        this.renumberSectionIndices();
        this.updateNavigationState();
    }

    private async ensureFolderRecursive(folderPath: string) {
        const parts = folderPath.split('/').filter(Boolean);
        let cur = '';
        for (const part of parts) {
            cur = cur ? `${cur}/${part}` : part;
            if (!this.app.vault.getAbstractFileByPath(cur)) {
                try {
                    await this.app.vault.createFolder(cur);
                } catch (_e) {}
            }
        }
    }

    private async onGenerateCoverClick() {
        const settings = this.settingsManager.getSettings();
        if (!this.currentFile) {
            new Notice('没有活动笔记');
            return;
        }
        const apiKey = (settings.geminiApiKey || '').trim();
        if (!apiKey) {
            new Notice('请先在设置中填写 Gemini API Key');
            return;
        }

        new Notice('正在请求 Gemini 生成封面...');
        try {
            const content = await this.app.vault.cachedRead(this.currentFile);
            const excerpt = CoverGenerator.extractExcerpt(content);
            const title = this.currentFile.basename.replace(/\.md$/i, '');
            const prompt = CoverGenerator.buildImagePrompt(title, excerpt, settings);
            const b64 = await CoverGenerator.geminiGenerateImageBase64(
                apiKey,
                settings.geminiImageModel || 'gemini-2.5-flash-image',
                prompt
            );
            const binStr = atob(b64);
            const bytes = new Uint8Array(binStr.length);
            for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);

            const folder = (settings.coverSaveFolder || '99_attachments/note-to-red-covers').replace(/\/+$/, '');
            await this.ensureFolderRecursive(folder);
            const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_');
            const outPath = `${folder}/generated-${safeTitle}.png`;
            const existing = this.app.vault.getAbstractFileByPath(outPath);
            if (existing) await this.app.vault.delete(existing);
            await this.app.vault.createBinary(outPath, bytes.buffer);

            new Notice(`封面已保存：${outPath}`);
            if (!settings.coverEnabled) {
                await this.settingsManager.updateSettings({ coverEnabled: true });
            }
            await this.syncCoverPage();
            this.themeManager.applyTheme(this.previewEl);
        } catch (error: any) {
            console.error('[obsidian-note2red] generate cover', error);
            new Notice(`生成失败：${error?.message || String(error)}`);
        }
    }

    private updateControlsState(enabled: boolean) {
        this.lockButton.disabled = !enabled;

        const themeSelect = this.customThemeSelect.querySelector('.red-select');
        const fontSelect = this.customFontSelect.querySelector('.red-select');
        if (this.headerToggleButton) this.headerToggleButton.disabled = !enabled;
        if (this.footerToggleButton) this.footerToggleButton.disabled = !enabled;
        if (themeSelect) {
            themeSelect.classList.toggle('disabled', !enabled);
            themeSelect.setAttribute('style', `pointer-events: ${enabled ? 'auto' : 'none'}`);
        }
        if (fontSelect) {
            fontSelect.classList.toggle('disabled', !enabled);
            fontSelect.setAttribute('style', `pointer-events: ${enabled ? 'auto' : 'none'}`);
        }

        this.fontSizeSelect.disabled = !enabled;
        const fontSizeButtons = this.containerEl.querySelectorAll('.red-font-size-btn');
        fontSizeButtons.forEach(button => {
            (button as HTMLButtonElement).disabled = !enabled;
        });

        this.copyButton.disabled = !enabled;
        if (this.coverGenButton) {
            this.coverGenButton.disabled = !enabled;
        }
        const singleDownloadButton = this.containerEl.querySelector('.red-export-button');
        if (singleDownloadButton) {
            (singleDownloadButton as HTMLButtonElement).disabled = !enabled;
        }
    }

    static syncCoverActiveFlag(previewEl: HTMLElement) {
        const imagePreview = previewEl.querySelector('.red-image-preview');
        if (!imagePreview) return;
        const coverShown = !!imagePreview.querySelector(
            '.red-cover-section.red-section-active:not(.red-section-hidden), .red-cover-section.red-section-visible'
        );
        imagePreview.classList.toggle('red-image-preview--cover-active', coverShown);
    }
    // #endregion

    // #region 文件处理
    async onFileOpen(file: TFile | null) {
        this.currentFile = file;
        this.currentImageIndex = 0;

        if (!file || file.extension !== 'md') {
            this.previewEl.empty();
            this.previewEl.createEl('div', {
                text: '只能预览 markdown 文本文档',
                cls: 'red-empty-state'
            });
            this.updateControlsState(false);
            return;
        }

        this.updateControlsState(true);
        this.isPreviewLocked = false;
        setIcon(this.lockButton, 'unlock');
        await this.updatePreview();
    }

    async onFileModify(file: TFile) {
        if (file === this.currentFile && !this.isPreviewLocked) {
            if (this.updateTimer) {
                window.clearTimeout(this.updateTimer);
            }
            this.updateTimer = window.setTimeout(() => {
                this.updatePreview();
            }, 500);
        }
    }

    private async togglePreviewLock() {
        this.isPreviewLocked = !this.isPreviewLocked;
        const lockIcon = this.isPreviewLocked ? 'lock' : 'unlock';
        const lockStatus = this.isPreviewLocked ? '开启实时预览状态' : '关闭实时预览状态';
        setIcon(this.lockButton, lockIcon);
        this.lockButton.setAttribute('aria-label', lockStatus);

        if (!this.isPreviewLocked) {
            await this.updatePreview();
        }
    }

    // #region 工具方法
    private createCustomSelect(
        parent: HTMLElement,
        className: string,
        options: { value: string; label: string }[]
    ) {
        const container = parent.createEl('div', { cls: `red-select-container ${className}` });
        const select = container.createEl('div', { cls: 'red-select' });
        const selectedText = select.createEl('span', { cls: 'red-select-text' });
        select.createEl('span', { cls: 'red-select-arrow', text: '▾' });

        const dropdown = container.createEl('div', { cls: 'red-select-dropdown' });

        options.forEach(option => {
            const item = dropdown.createEl('div', {
                cls: 'red-select-item',
                text: option.label
            });

            item.dataset.value = option.value;
            item.addEventListener('click', () => {
                dropdown.querySelectorAll('.red-select-item').forEach(el =>
                    el.classList.remove('red-selected'));
                item.classList.add('red-selected');
                selectedText.textContent = option.label;
                select.dataset.value = option.value;
                dropdown.classList.remove('red-show');
                select.dispatchEvent(new CustomEvent('change', {
                    detail: { value: option.value }
                }));
            });
        });

        if (options.length > 0) {
            selectedText.textContent = options[0].label;
            select.dataset.value = options[0].value;
            dropdown.querySelector('.red-select-item')?.classList.add('red-selected');
        }

        select.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('red-show');
        });

        document.addEventListener('click', () => {
            dropdown.classList.remove('red-show');
        });

        return container;
    }

    private async getThemeOptions() {
        const templates = this.settingsManager.getVisibleThemes();
        return templates.length > 0
            ? templates.map(t => ({ value: t.id, label: t.name }))
            : [{ value: 'default', label: '默认主题' }];
    }

    private async getTemplateOptions() {
        return this.imgTemplateManager.getImgTemplateOptions();
    }

    private getFontOptions() {
        return this.settingsManager.getFontOptions();
    }
    // #endregion


    // 检查是否需要显示捐赠弹窗
    private shouldShowDonatePrompt(): boolean {
        // 增加使用次数
        this.donateCount++;

        // 保存到设置中
        if (this.settingsManager) {
            const settings = this.settingsManager.getSettings();
            settings.donateCount = this.donateCount;
            this.settingsManager.updateSettings(settings);
        }

        const now = Date.now();
        const oneDayInMs = 24 * 60 * 60 * 1000; // 一天的毫秒数

        // 如果使用次数达到阈值且24小时内未显示过
        if (this.donateCount % this.MAX_COUNT_BEFORE_PROMPT === 0 && now - this.lastDonatePrompt > oneDayInMs) {
            // 更新上次显示时间
            this.lastDonatePrompt = now;

            // 保存到设置中
            if (this.settingsManager) {
                const settings = this.settingsManager.getSettings();
                settings.lastDonatePrompt = this.lastDonatePrompt;
                this.settingsManager.updateSettings(settings);
            }

            return true;
        }

        return false;
    }
}
