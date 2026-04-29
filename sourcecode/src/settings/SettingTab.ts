import { App, PluginSettingTab, Setting, setIcon, Notice } from 'obsidian';
import RedPlugin from '../main'; // 修改插件名以匹配类名
import { CreateThemeModal } from './CreateThemeModal';
import { CreateFontModal } from './CreateFontModal';
import { ConfirmModal } from './ConfirmModal'; // 添加确认模态框导入
import { ThemePreviewModal } from './ThemePreviewModal'; // 新增导入
import { VIEW_TYPE_RED } from '../view';
import { CoverGenerator } from '../coverGenerator';

export class RedSettingTab extends PluginSettingTab {
    plugin: RedPlugin; // 修改插件类型以匹配类名
    private expandedSections: Set<string> = new Set();

    constructor(app: App, plugin: RedPlugin) { // 修改插件类型以匹配类名
        super(app, plugin);
        this.plugin = plugin;
    }

    private createSection(containerEl: HTMLElement, title: string, renderContent: (contentEl: HTMLElement) => void) {
        const section = containerEl.createDiv('settings-section');
        const header = section.createDiv('settings-section-header');
        
        const toggle = header.createSpan('settings-section-toggle');
        setIcon(toggle, 'chevron-right');
        
        header.createEl('h4', { text: title });
        
        const content = section.createDiv('settings-section-content');
        renderContent(content);
        
        header.addEventListener('click', () => {
            const isExpanded = !section.hasClass('is-expanded');
            section.toggleClass('is-expanded', isExpanded);
            setIcon(toggle, isExpanded ? 'chevron-down' : 'chevron-right');
            if (isExpanded) {
                this.expandedSections.add(title);
            } else {
                this.expandedSections.delete(title);
            }
        });
        
        if (this.expandedSections.has(title) || (!containerEl.querySelector('.settings-section'))) {
            section.addClass('is-expanded');
            setIcon(toggle, 'chevron-down');
            this.expandedSections.add(title);
        }
        
        return section;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.addClass('red-settings');

        containerEl.createEl('h2', { text: 'Note2Red 设置' });

        this.createSection(containerEl, '基本设置', el => this.renderBasicSettings(el));
        this.createSection(containerEl, '主题设置', el => this.renderThemeSettings(el));
        this.createSection(containerEl, '封面与 Gemini', el => this.renderCoverSettings(el));
    }

    private async refreshActiveViews() {
        const leaves = this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_RED);
        for (const leaf of leaves) {
            const view = leaf.view as any;
            if (view && typeof view.updatePreview === 'function') {
                if (typeof view.syncChromeToggleButtons === 'function') {
                    view.syncChromeToggleButtons();
                }
                await view.updatePreview();
            }
        }
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

    private renderCoverSettings(containerEl: HTMLElement): void {
        const settings = () => this.plugin.settingsManager.getSettings();

        new Setting(containerEl)
            .setName('启用第一页封面')
            .setDesc('开启后会在正文分页前插入一页封面。')
            .addToggle(toggle => toggle
                .setValue(settings().coverEnabled === true)
                .onChange(async value => {
                    await this.plugin.settingsManager.updateSettings({ coverEnabled: value });
                    await this.refreshActiveViews();
                })
            );

        new Setting(containerEl)
            .setName('封面排版风格')
            .setDesc('控制封面页标题、图片和摘要的位置。')
            .addDropdown(dropdown => dropdown
                .addOption('image-top', '图片在上 + 标题在下')
                .addOption('title-top', '标题在上 + 图片在中 + 摘要在下')
                .setValue(settings().coverLayout || 'image-top')
                .onChange(async (value: 'image-top' | 'title-top') => {
                    await this.plugin.settingsManager.updateSettings({ coverLayout: value });
                    await this.refreshActiveViews();
                })
            );

        new Setting(containerEl)
            .setName('显示封面摘要')
            .setDesc('仅在“标题在上”模式下生效；摘要也可以在封面预览区直接点击编辑。')
            .addToggle(toggle => toggle
                .setValue(settings().coverShowExcerpt !== false)
                .onChange(async value => {
                    await this.plugin.settingsManager.updateSettings({ coverShowExcerpt: value });
                    await this.refreshActiveViews();
                })
            );

        new Setting(containerEl)
            .setName('封面标题字体')
            .setDesc('留空则跟随正文；示例：SimSun, 宋体, serif')
            .addText(text => {
                text.setPlaceholder('留空跟随正文字体');
                text.setValue(settings().coverTitleFont || '');
                text.onChange(async value => {
                    await this.plugin.settingsManager.updateSettings({ coverTitleFont: value.trim() });
                    await this.refreshActiveViews();
                });
            });

        new Setting(containerEl)
            .setName('Gemini API Key')
            .setDesc('用于点击“生成封面”时调用 Gemini。')
            .addText(text => {
                text.inputEl.type = 'password';
                text.setPlaceholder('AIza...');
                text.setValue(settings().geminiApiKey || '');
                text.onChange(async value => {
                    await this.plugin.settingsManager.updateSettings({ geminiApiKey: value.trim() });
                });
            });

        new Setting(containerEl)
            .setName('Gemini 图片模型')
            .setDesc('默认 gemini-2.5-flash-image。')
            .addText(text => {
                text.setValue(settings().geminiImageModel || 'gemini-2.5-flash-image');
                text.onChange(async value => {
                    await this.plugin.settingsManager.updateSettings({ geminiImageModel: value.trim() || 'gemini-2.5-flash-image' });
                });
            });

        new Setting(containerEl)
            .setName('封面存储文件夹')
            .setDesc('AI 生成与手动上传的封面图都会存到这个库内相对路径。')
            .addText(text => {
                text.setPlaceholder('99_attachments/note-to-red-covers');
                text.setValue(settings().coverSaveFolder || '');
                text.onChange(async value => {
                    await this.plugin.settingsManager.updateSettings({ coverSaveFolder: value.trim() });
                });
            });

        new Setting(containerEl)
            .setName('手动封面图路径')
            .setDesc('填入库内相对路径时优先于 AI 生成图。')
            .addText(text => {
                text.setValue(settings().coverManualImagePath || '');
                text.onChange(async value => {
                    await this.plugin.settingsManager.updateSettings({ coverManualImagePath: value.trim() });
                    await this.refreshActiveViews();
                });
            })
            .addButton(button => button
                .setButtonText('从本机选图并存入库')
                .onClick(async () => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = async () => {
                        const file = input.files?.[0];
                        if (!file) return;
                        const buffer = await file.arrayBuffer();
                        const folder = (settings().coverSaveFolder || '99_attachments/note-to-red-covers').replace(/\/+$/, '');
                        await this.ensureFolderRecursive(folder);
                        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                        const outPath = `${folder}/manual-upload-${Date.now()}-${safe}`;
                        await this.app.vault.createBinary(outPath, buffer);
                        await this.plugin.settingsManager.updateSettings({ coverManualImagePath: outPath });
                        new Notice(`已保存：${outPath}`);
                        this.display();
                        await this.refreshActiveViews();
                    };
                    input.click();
                })
            )
            .addButton(button => button
                .setButtonText('清空')
                .onClick(async () => {
                    await this.plugin.settingsManager.updateSettings({ coverManualImagePath: '' });
                    this.display();
                    await this.refreshActiveViews();
                })
            );

        const presetKey = settings().coverPromptPreset || 'notion';
        const currentCustom = settings().coverPromptCustom || '';
        const currentPresetText = CoverGenerator.PROMPT_PRESETS[presetKey] || CoverGenerator.PROMPT_PRESETS.notion;
        const promptSetting = new Setting(containerEl)
            .setName('封面提示词')
            .setDesc('可使用 {标题} 和 {摘要} 作为占位符。');

        const textarea = document.createElement('textarea');
        textarea.className = 'red-prompt-textarea';
        textarea.rows = 10;
        textarea.value = currentCustom.trim() ? currentCustom : currentPresetText;
        textarea.style.cssText = 'width: 100%; min-height: 150px; font-size: 13px; line-height: 1.5; resize: vertical; padding: 8px; border: 1px solid var(--background-modifier-border); border-radius: 6px; background: var(--background-primary); color: var(--text-normal); font-family: inherit;';
        promptSetting.settingEl.appendChild(textarea);
        promptSetting.settingEl.style.flexWrap = 'wrap';

        const row = document.createElement('div');
        row.style.cssText = 'width: 100%; display: flex; gap: 8px; margin-top: 6px; align-items: center;';
        const save = document.createElement('button');
        save.textContent = '保存提示词';
        save.className = 'mod-cta';
        save.addEventListener('click', async () => {
            await this.plugin.settingsManager.updateSettings({ coverPromptCustom: textarea.value });
            new Notice('提示词已保存');
        });
        const restore = document.createElement('button');
        restore.textContent = '恢复默认';
        restore.addEventListener('click', async () => {
            textarea.value = CoverGenerator.PROMPT_PRESETS[settings().coverPromptPreset || 'notion'] || CoverGenerator.PROMPT_PRESETS.notion;
            await this.plugin.settingsManager.updateSettings({ coverPromptCustom: '' });
            new Notice('已恢复默认预设提示词');
        });
        row.appendChild(save);
        row.appendChild(restore);
        promptSetting.settingEl.appendChild(row);
    }

    private renderBasicSettings(containerEl: HTMLElement): void {
        // 排版管理区域
        const typographySection = containerEl.createDiv('red-settings-subsection');
        const typographyHeader = typographySection.createDiv('red-settings-subsection-header');
        const typographyToggle = typographyHeader.createSpan('red-settings-subsection-toggle');
        setIcon(typographyToggle, 'chevron-right');
        
        typographyHeader.createEl('h3', { text: '维护说明' });
        
        const typographyContent = typographySection.createDiv('red-settings-subsection-content');
        
        // 折叠/展开逻辑
        typographyHeader.addEventListener('click', () => {
            const isExpanded = !typographySection.hasClass('is-expanded');
            typographySection.toggleClass('is-expanded', isExpanded);
            setIcon(typographyToggle, isExpanded ? 'chevron-down' : 'chevron-right');
        });

        typographyContent.createEl('p', {
            text: '当前版本按页面高度自动分页；如需手动换页，在正文中插入 --- 分隔线。',
            cls: 'setting-item-description'
        });

        // 字体管理区域
        const fontSection = containerEl.createDiv('red-settings-subsection');
        const fontHeader = fontSection.createDiv('red-settings-subsection-header');
        const fontToggle = fontHeader.createSpan('red-settings-subsection-toggle');
        setIcon(fontToggle, 'chevron-right');
        
        fontHeader.createEl('h3', { text: '字体管理' });
        
        const fontContent = fontSection.createDiv('red-settings-subsection-content');
        
        // 折叠/展开逻辑
        fontHeader.addEventListener('click', () => {
            const isExpanded = !fontSection.hasClass('is-expanded');
            fontSection.toggleClass('is-expanded', isExpanded);
            setIcon(fontToggle, isExpanded ? 'chevron-down' : 'chevron-right');
        });

        // 字体列表
        const fontList = fontContent.createDiv('font-management');
        this.plugin.settingsManager.getFontOptions().forEach(font => {
            const fontItem = fontList.createDiv('font-item');
            const setting = new Setting(fontItem)
                .setName(font.label)
                .setDesc(font.value);

            // 只为非预设字体添加编辑和删除按钮
            if (!font.isPreset) {
                setting
                    .addExtraButton(btn => 
                        btn.setIcon('pencil')
                            .setTooltip('编辑')
                            .onClick(() => {
                                new CreateFontModal(
                                    this.app,
                                    async (updatedFont) => {
                                        await this.plugin.settingsManager.updateFont(font.value, updatedFont);
                                        this.display();
                                        new Notice('请重启 Obsidian 或重新加载以使更改生效');
                                    },
                                    font
                                ).open();
                            }))
                    .addExtraButton(btn => 
                        btn.setIcon('trash')
                            .setTooltip('删除')
                            .onClick(() => {
                                // 新增确认模态框
                                new ConfirmModal(
                                    this.app,
                                    '确认删除字体',
                                    `确定要删除「${font.label}」字体配置吗？`,
                                    async () => {
                                        await this.plugin.settingsManager.removeFont(font.value);
                                        this.display();
                                        new Notice('请重启 Obsidian 或重新加载以使更改生效');
                                    }
                                ).open();
                            }));
            }
        });

        // 添加新字体按钮
        new Setting(fontContent)
            .addButton(btn => btn
                .setButtonText('+ 添加字体')
                .setCta()
                .onClick(() => {
                    new CreateFontModal(
                        this.app,
                        async (newFont) => {
                            await this.plugin.settingsManager.addCustomFont(newFont);
                            this.display();
                            new Notice('请重启 Obsidian 或重新加载以使更改生效');
                        }
                    ).open();
                }));
    }

    private renderThemeSettings(containerEl: HTMLElement): void {
        // 主题显示设置部分
        const themeVisibilitySection = containerEl.createDiv('red-settings-subsection');
        const themeVisibilityHeader = themeVisibilitySection.createDiv('red-settings-subsection-header');
        
        const themeVisibilityToggle = themeVisibilityHeader.createSpan('red-settings-subsection-toggle');
        setIcon(themeVisibilityToggle, 'chevron-right');
        
        themeVisibilityHeader.createEl('h3', { text: '显示设置' });
        
        const themeVisibilityContent = themeVisibilitySection.createDiv('red-settings-subsection-content');
        
        // 折叠/展开逻辑
        themeVisibilityHeader.addEventListener('click', () => {
            const isExpanded = !themeVisibilitySection.hasClass('is-expanded');
            themeVisibilitySection.toggleClass('is-expanded', isExpanded);
            setIcon(themeVisibilityToggle, isExpanded ? 'chevron-down' : 'chevron-right');
        });

        const refreshActiveViews = async () => {
            const leaves = this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_RED);
            for (const leaf of leaves) {
                const view = leaf.view as any;
                if (view && typeof view.updatePreview === 'function') {
                    if (typeof view.syncChromeToggleButtons === 'function') {
                        view.syncChromeToggleButtons();
                    }
                    await view.updatePreview();
                }
            }
        };
        
        new Setting(themeVisibilityContent)
            .setName('是否显示页眉（头像和用户信息）')
            .setDesc('关闭后文字区域会自动扩大，每页容纳更多内容')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settingsManager.getSettings().showHeader === true)
                .onChange(async (value) => {
                    await this.plugin.settingsManager.updateSettings({
                        showHeader: value
                    });
                    await refreshActiveViews();
                })
            );

        new Setting(themeVisibilityContent)
            .setName('是否显示时间')
            .setDesc('需先开启页眉；打开后时间显示在用户信息右侧')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settingsManager.getSettings().showTime !== false)
                .onChange(async (value) => {
                    await this.plugin.settingsManager.updateSettings({
                        showTime: value
                    });
                    await refreshActiveViews();
                })
            );

        // 添加页脚显示设置
        new Setting(themeVisibilityContent)
            .setName('是否显示页脚')
            .setDesc('控制是否在主题中显示页脚部分')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settingsManager.getSettings().showFooter !== false)
                .onChange(async (value) => {
                    await this.plugin.settingsManager.updateSettings({
                        showFooter: value
                    });
                    await refreshActiveViews();
                })
            );

        new Setting(themeVisibilityContent)
            .setName('全局文字颜色')
            .setDesc('留空则跟随主题默认色。填写后对正文、列表、引用、标题、表格等生效。')
            .addText(text => {
                text.setPlaceholder('#333333');
                text.setValue(this.plugin.settingsManager.getSettings().textColor || '');
                text.onChange(async value => {
                    await this.plugin.settingsManager.updateSettings({ textColor: value.trim() });
                    await refreshActiveViews();
                });
            })
            .addButton(button => button
                .setButtonText('清空')
                .onClick(async () => {
                    await this.plugin.settingsManager.updateSettings({ textColor: '' });
                    await refreshActiveViews();
                    this.display();
                })
            );
   
        themeVisibilityContent.createEl('hr', { cls: 'red-settings-divider' });

        // 主题选择容器
        const themeSelectionContainer = themeVisibilityContent.createDiv('theme-selection-container');
        
        // 左侧：所有主题列表
        const allThemesContainer = themeSelectionContainer.createDiv('all-themes-container');
        allThemesContainer.createEl('h4', { text: '隐藏主题' });
        const allThemesList = allThemesContainer.createDiv('themes-list');
        
        // 中间：控制按钮
        const controlButtonsContainer = themeSelectionContainer.createDiv('control-buttons-container');
        const addButton = controlButtonsContainer.createEl('button', { text: '>' });
        const removeButton = controlButtonsContainer.createEl('button', { text: '<' });

        // 右侧：显示的主题列表
        const visibleThemesContainer = themeSelectionContainer.createDiv('visible-themes-container');
        visibleThemesContainer.createEl('h4', { text: '显示主题' });
        const visibleThemesList = visibleThemesContainer.createDiv('themes-list');
        
        
        
        // 获取所有主题
        const allThemes = this.plugin.settingsManager.getAllThemes();
        
        // 渲染主题列表
        const renderThemeLists = () => {
            // 清空列表
            allThemesList.empty();
            visibleThemesList.empty();
            
            // 填充左侧列表（所有未显示的主题）
            allThemes
                .filter(theme => theme.isVisible === false)
                .forEach(theme => {
                    const themeItem = allThemesList.createDiv('theme-list-item');
                    themeItem.textContent = theme.name;
                    themeItem.dataset.themeId = theme.id;
                    
                    // 点击选中/取消选中
                    themeItem.addEventListener('click', () => {
                        themeItem.toggleClass('selected', !themeItem.hasClass('selected'));
                    });
                });
            
            // 填充右侧列表（所有显示的主题）
            allThemes
                .filter(theme => theme.isVisible !== false) // 默认显示
                .forEach(theme => {
                    const themeItem = visibleThemesList.createDiv('theme-list-item');
                    themeItem.textContent = theme.name;
                    themeItem.dataset.themeId = theme.id;
                    
                    // 点击选中/取消选中
                    themeItem.addEventListener('click', () => {
                        themeItem.toggleClass('selected', !themeItem.hasClass('selected'));
                    });
                });
        };
        
        // 初始渲染
        renderThemeLists();
        
        // 添加按钮事件
        addButton.addEventListener('click', async () => {
            const selectedItems = Array.from(allThemesList.querySelectorAll('.theme-list-item.selected'));
            if (selectedItems.length === 0) return;
            
            for (const item of selectedItems) {
                const themeId = (item as HTMLElement).dataset.themeId;
                if (!themeId) continue;
                
                const theme = allThemes.find(t => t.id === themeId);
                if (theme) {
                    theme.isVisible = true;
                    await this.plugin.settingsManager.updateTheme(themeId, theme);
                }
            }
            
            renderThemeLists();
            new Notice('请重启 Obsidian 或重新加载以使更改生效');
        });
        
        // 移除按钮事件
        removeButton.addEventListener('click', async () => {
            const selectedItems = Array.from(visibleThemesList.querySelectorAll('.theme-list-item.selected'));
            if (selectedItems.length === 0) return;
            
            for (const item of selectedItems) {
                const themeId = (item as HTMLElement).dataset.themeId;
                if (!themeId) continue;
                
                const theme = allThemes.find(t => t.id === themeId);
                if (theme) {
                    theme.isVisible = false;
                    await this.plugin.settingsManager.updateTheme(themeId, theme);
                }
            }
            
            renderThemeLists();
            new Notice('请重启 Obsidian 或重新加载以使更改生效');
        });

        // 主题管理区域
        const themeList = containerEl.createDiv('theme-management');
        // 渲染自定义主题
        themeList.createEl('h4', { text: '自定义主题', cls: 'theme-custom-header' });
        this.plugin.settingsManager.getAllThemes()
            .filter(theme => !theme.isPreset)
            .forEach(theme => {
                const themeItem = themeList.createDiv('theme-item');
                new Setting(themeItem)
                    .setName(theme.name)
                    .setDesc(theme.description)
                    .addExtraButton(btn => 
                        btn.setIcon('eye')
                            .setTooltip('预览')
                            .onClick(() => {
                                new ThemePreviewModal(this.app, this.plugin.settingsManager, theme, this.plugin.themeManager).open(); // 修改为使用预览模态框
                            }))
                    .addExtraButton(btn => 
                        btn.setIcon('pencil')
                            .setTooltip('编辑')
                            .onClick(() => {
                                new CreateThemeModal(
                                    this.app,
                                    this.plugin,
                                    (updatedTheme) => {
                                        this.plugin.settingsManager.updateTheme(theme.id, updatedTheme);
                                        this.display();
                                        new Notice('请重启 Obsidian 或重新加载以使更改生效');
                                    },
                                    theme
                                ).open();
                            }))
                    .addExtraButton(btn => 
                        btn.setIcon('trash')
                            .setTooltip('删除')
                            .onClick(() => {
                                // 新增确认模态框
                                new ConfirmModal(
                                    this.app,
                                    '确认删除主题',
                                    `确定要删除「${theme.name}」主题吗？此操作不可恢复。`,
                                    async () => {
                                        await this.plugin.settingsManager.removeTheme(theme.id);
                                        this.display();
                                        new Notice('请重启 Obsidian 或重新加载以使更改生效');
                                    }
                                ).open();
                            }));
            });
    
        // 添加新主题按钮
        new Setting(containerEl)
            .addButton(btn => btn
                .setButtonText('+ 新建主题')
                .setCta()
                .onClick(() => {
                    new CreateThemeModal(
                        this.app,
                        this.plugin,
                        async (newTheme) => {
                            await this.plugin.settingsManager.addCustomTheme(newTheme);
                            this.display();
                            new Notice('请重启 Obsidian 或重新加载以使更改生效');
                        }
                    ).open();
                }));
    }
}
