/**
 * 轻量日志模块，支持日志等级控制
 *
 * 等级从低到高: debug < info < warn < error
 * 通过命令行参数指定: --log-level=debug
 * 或通过环境变量: LOG_LEVEL=debug
 * 默认等级: info
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

let currentLevel = LEVELS.info;

/**
 * 从命令行参数或环境变量解析日志等级
 */
function init() {
  // 环境变量: LOG_LEVEL=debug (lower priority)
  const env = (process.env.LOG_LEVEL || '').toLowerCase();
  if (env in LEVELS) {
    currentLevel = LEVELS[env];
  }
  // 命令行: --log-level=debug (higher priority, overrides env)
  const arg = process.argv.find(a => a.startsWith('--log-level='));
  if (arg) {
    const val = arg.split('=')[1].toLowerCase();
    if (val in LEVELS) {
      currentLevel = LEVELS[val];
    }
  }
}

function setLevel(level) {
  const l = (level || '').toLowerCase();
  if (l in LEVELS) {
    currentLevel = LEVELS[l];
  }
}

function getLevel() {
  return Object.keys(LEVELS).find(k => LEVELS[k] === currentLevel);
}

function timestamp() {
  return new Date().toISOString();
}

function debug(tag, ...args) {
  if (currentLevel <= LEVELS.debug) {
    console.log(`${timestamp()} [DEBUG] [${tag}]`, ...args);
  }
}

function info(tag, ...args) {
  if (currentLevel <= LEVELS.info) {
    console.log(`${timestamp()} [INFO]  [${tag}]`, ...args);
  }
}

function warn(tag, ...args) {
  if (currentLevel <= LEVELS.warn) {
    console.warn(`${timestamp()} [WARN]  [${tag}]`, ...args);
  }
}

function error(tag, ...args) {
  if (currentLevel <= LEVELS.error) {
    console.error(`${timestamp()} [ERROR] [${tag}]`, ...args);
  }
}

// 自动初始化
init();

module.exports = { debug, info, warn, error, setLevel, getLevel, init };
