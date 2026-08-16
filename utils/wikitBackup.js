/**
 * wikit CLI 备份参数构建工具
 * wikit 是 Wikit（wikit.unitreaty.org）的全站备份 CLI（Go 编写），
 * 备份数据与 ProjectWikit 归档格式兼容。
 */

/** 从站点配置解析 wiki 的 unix 名（备份用名称），如 https://deep-forest-club.wikidot.com/ -> deep-forest-club */
function getWikiName(siteConfig) {
    if (!siteConfig || !siteConfig.URL) return '';
    try {
        return new URL(siteConfig.URL).hostname.replace(/^www\./i, '').split('.')[0];
    } catch (e) {
        return String(siteConfig.URL).replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('.')[0];
    }
}

/**
 * 构建 wikit backup 命令参数
 * 用法：wikit backup <name> [name...] [--keep-removed] [--base-dir <path>]
 * @param {object} opts { wikiNames: string[], keepRemoved?: boolean, baseDir?: string }
 * @returns {string[]} spawn('wikit', args) 使用的参数数组
 */
function buildBackupArgs({ wikiNames, keepRemoved = false, baseDir } = {}) {
    const names = Array.isArray(wikiNames) ? wikiNames.filter(Boolean) : [];
    const args = ['backup', ...names];
    if (keepRemoved) args.push('--keep-removed');
    if (baseDir) args.push('--base-dir', String(baseDir));
    return args;
}

module.exports = { getWikiName, buildBackupArgs };
