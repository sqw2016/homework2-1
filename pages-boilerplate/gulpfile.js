// 实现这个项目的构建任务
const { src, dest, series, parallel, watch } = require('gulp')
const del = require('del')
const bs = require('browser-sync')
const ghPages = require('gulp-gh-pages')
const loadPlugins = require('gulp-load-plugins')
const plugins = loadPlugins()

const data = {
  menus: [
    {
      name: 'Home',
      icon: 'aperture',
      link: 'index.html'
    },
    {
      name: 'Features',
      link: 'features.html'
    },
    {
      name: 'About',
      link: 'about.html'
    },
    {
      name: 'Contact',
      link: '#',
      children: [
        {
          name: 'Twitter',
          link: 'https://twitter.com/w_zce'
        },
        {
          name: 'About',
          link: 'https://weibo.com/zceme'
        },
        {
          name: 'divider'
        },
        {
          name: 'About',
          link: 'https://github.com/zce'
        }
      ]
    }
  ],
  pkg: require('./package.json'),
  date: new Date()
}

/**
 * 根据规则解析命令行参数，process.argv中的如果匹配到，则下一个元素为参数的值
 * @param {*} rules 
 */
const commandArgumentsHandle = (rules) => {
    const params = process.argv.slice(2)
    const config = {}
    params.forEach((item, index) => {
        const r = rules[item] // 匹配到的规则
        if (r) { // 命令行参数存在
            // 先判断值是否可缺省，如果可缺省，则填充缺省值
            config[r.dataIndex] = r.valueOmit === true ? 
            r.omittedValue : // 如果可以缺省，则取缺省值，如果没有缺省值，则取默认值
            params[index+1] // 如果不可缺省，则取传入的值或默认值。
        }
    })
    return config
}

/**
 * 将具有别名的 rules 扩展到新的数组中
 * @param {*} rules 
 */
const expendAliasRules = (rules) => {
    Object.values(rules).forEach(r => {
        if (r.alias) {
            rules[r.alias] = r;
        }
    })
}

/**
 * 将命令行参数转化为配置
 * @param {*} rules 命令行参数规则
 * rules: {
 *  name: { ’-open‘ 命令参数名
 *      default: , 默认值
 *      valueOmit: true, 值是否可缺省
 *      omittedValue: , 缺省时的值
 *      dataIndex: ’open',// 参数对应的字段
 *      alias: '',// 别名
 * }
 * }
 */
const argumentsToConfig = (rules) => {
    expendAliasRules(rules);// 将具有别名的参数展开放到列表中
    // 从命令行中解析参数，并将参数放到对象中返回
    const config = commandArgumentsHandle(rules);
    // 将未传入的命令行参数的默认值填充到配置中
    Object.values(rules).forEach(r => {
        if (!config[r.dataIndex]) {
            config[r.dataIndex] = r.default
        }
    })
    return config;
}

const clean = () => {
    return del(['dist', 'temp'])
}

// 处理HTML文件
const page = () => {
    return src('src/**/*.html', { base: 'src' })
        .pipe(plugins.swig({data, default: { cache: false }})) // 不使用缓存
        .pipe(dest('temp'))
}
// 编译scss文件
const style = () => {
    return src('src/assets/styles/*.scss', { base: 'src' })
        .pipe(plugins.sass()) // gulp-sass 会默认不处理 _ 开头的文件
        .pipe(dest('temp'))
}
// 将js代码转换为 es5
const js = () => {
    return src('src/assets/scripts/*.js', { base: 'src' })
    .pipe(plugins.babel({
        presets: ['@babel/preset-env']
    }))
    .pipe(dest('temp'))
}
// 处理图片文件
const image = () => {
    return src('src/assets/images/**', { base: 'src' })
        .pipe(plugins.imagemin())
        .pipe(dest('dist'))
}
// 处理字体文件，imagemin会处理图片文件，其他文件会原样复制
const font = () => {
    return src('src/assets/fonts/**', { base: 'src' })
        .pipe(plugins.imagemin())
        .pipe(dest('dist'))
}
// 处理其他文件, public文件中的文件原样复制
const others = () => {
    return src('public/**', { base: 'public' })
        .pipe(dest('dist'))
}

// lint检查js
const eslint = () => {
    return src('src/assets/scripts/*.js')
        .pipe(plugins.eslint())
        .pipe(plugins.eslint.failOnError())
}

// lint 检查 sass 
const sassLint = () => {
    return src('src/assets/styles/*.scss')
        .pipe(plugins.sassLint())
}

// 启动浏览器预览
const server = (dest) => () => {
  // 监听文件变化,并执行对应任务
  watch('src/**/*.html', page)
  watch('src/assets/scripts/*.js', js)
  watch('src/assets/styles/*.scss', style)
  watch(['src/assets/images/**', 'src/assets/fonts/**', 'public'], bs.reload)

  const config = argumentsToConfig({
      '--open': {
          dataIndex: 'open',
          default: false,
          valueOmit: true,
          omittedValue: true
      },
      '--port': {
          dataIndex: 'port',
          default: 2080,
          valueOmit: false,
          alias: '--p'
      }
  })
  bs.init({
      port: config.port,
      files: dest + '/**', // 监听temp文件下的文件发生变化，刷新浏览器
      open: config.open,
      server: {
          baseDir: [dest, 'src'], // 文件请求先会从dist目录中查找模块，没有找到，再从src中找，
          routes: {
              '/node_modules': 'node_modules' // 所有 /node_module 模块都从当前目录的 node_module 中获取
          }
      }
  })
}

// 处理 node_modules 引入以及压缩编译后的代码
const useref = (production) => () => {
    //  production 模式下压缩文件，非production模式下不压缩文件
    const config = argumentsToConfig({
        '--production': {
            dataIndex: 'production',
            default: production,
            valueOmit: true,
            omittedValue: true,
            alias: '--prod'
        }
    })
    if (config.production) { // production模式
      return src('temp/**/*.html')
        .pipe(plugins.useref({ searchPath: ['temp', '.'] }))
        .pipe(plugins.if(/\.html$/, plugins.htmlmin({
            collapseWhitespace: true, // 删除标签之间的空白字符
            minifyCSS: true, // 压缩css
            minifyJS: true, // 压缩js
            removeComments: true, // 去除注释
        })))
        .pipe(plugins.if(/\.js$/, plugins.uglify()))
        .pipe(plugins.if(/\.css$/, plugins.cleanCss()))
        .pipe(dest('dist'))
    } else {
      return src('temp/**/*.html')
        .pipe(plugins.useref({ searchPath: ['temp', '.'] }))
        .pipe(dest('dist'))
    }
    
}

const deploy = () => {
  const config = argumentsToConfig({
      '--branch': {
          dataIndex: 'branch',
          default: 'gh-pages',
          valueOmit: false
      }
  })
  return src('dist/**/*')
    .pipe(ghPages({
      remoteUrl: 'https://pages.github.com',
      branch: config.branch
    }))
}

// 编译 html, sass, js
const compile = parallel(page, style, js);
// 根据是否是production模式来创建build任务
const createBuild = production => series(clean, parallel(compile, image, font, others), useref(production))
// 构建上线包
const build = createBuild(false)
const serve = series(clean, compile, server('temp'))
const start = series(createBuild(true), server('dist'))
const lint = parallel(eslint, sassLint)
module.exports = {
    compile,
    build,
    clean,
    serve,
    lint,
    start,
    deploy,
}