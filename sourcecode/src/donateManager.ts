
import { App, Plugin } from 'obsidian';

export class DonateManager {
    private static overlay: HTMLElement;
    private static modal: HTMLElement;
    private static app: App;
    private static plugin: Plugin;

    public static initialize(app: App, plugin: Plugin) {
        this.app = app;
        this.plugin = plugin;
    }

    public static showDonateModal(container: HTMLElement) {
        this.overlay = container.createEl('div', {
            cls: 'red-about-overlay'
        });

        this.modal = this.overlay.createEl('div', {
            cls: 'red-about-modal'
        });

        // 添加关闭按钮
        const closeButton = this.modal.createEl('button', {
            cls: 'red-about-close',
            text: '×'
        });

        const headerSection = this.modal.createEl('div', {
            cls: 'red-about-header'
        });
        headerSection.createEl('div', {
            cls: 'red-about-name',
            text: '八股仙人'
        });
        headerSection.createEl('div', {
            cls: 'red-about-identity',
            text: '上海执业律师'
        });
        headerSection.createEl('div', {
            cls: 'red-about-tagline',
            text: '法律 + AI 的思考者和实践者'
        });

        const bioSection = this.modal.createEl('div', {
            cls: 'red-about-section'
        });
        bioSection.createEl('h4', {
            text: '我在做什么',
            cls: 'red-about-subtitle'
        });
        const bioEl = bioSection.createEl('p', {
            cls: 'red-about-desc'
        });
        bioEl.appendText('我关注法律、AI、写作效率与自动化工具，');
        bioEl.createEl('br');
        bioEl.appendText('致力于让文字工作者从重复劳动中解放出来，');
        bioEl.createEl('br');
        bioEl.appendText('把更多精力留给判断、表达和创造。');

        const pluginSection = this.modal.createEl('div', {
            cls: 'red-about-section'
        });
        pluginSection.createEl('h4', {
            text: '这个插件',
            cls: 'red-about-subtitle'
        });
        const pluginDescEl = pluginSection.createEl('p', {
            cls: 'red-about-desc'
        });
        pluginDescEl.appendText('它服务于高频写作和内容分发场景，');
        pluginDescEl.createEl('br');
        pluginDescEl.appendText('尽量减少排版、导出、适配平台格式这些机械步骤。');

        const contactSection = this.modal.createEl('div', {
            cls: 'red-about-section red-about-contact-section'
        });
        contactSection.createEl('h4', {
            text: '关注方式',
            cls: 'red-about-subtitle'
        });
        this.createContactRow(contactSection, '微信公众号', '八股仙人');
        this.createContactRow(contactSection, '微博', '八股仙人AI');

        // 添加关闭事件
        closeButton.addEventListener('click', () => this.closeDonateModal());
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.closeDonateModal();
            }
        });
    }

    private static closeDonateModal() {
        if (this.overlay) {
            this.overlay.remove();
        }
    }

    private static createContactRow(parent: HTMLElement, label: string, value: string) {
        const row = parent.createEl('div', {
            cls: 'red-about-contact-row'
        });
        row.createEl('span', {
            cls: 'red-about-contact-label',
            text: label
        });
        row.createEl('span', {
            cls: 'red-about-contact-value',
            text: value
        });
    }
}
