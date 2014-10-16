var gulp = require('gulp');
var browserify = require('gulp-browserify');
var borschik = require('gulp-borschik');
var rename = require('gulp-rename');

var stylus = require('gulp-stylus');
var autoprefixer = require('gulp-autoprefixer');

var exec = require('child_process').exec;

gulp.task('yate', function() {
    return gulp.src('client/templates/*.yate')
        .pipe(borschik({ minimize: false, tech: 'yate' }))
        .pipe(rename({basename: 'templates', extname: '.js'}))
        .pipe(gulp.dest('build/js/'));
});

gulp.task('styl', function() {
    return gulp.src('client/*.styl')
        .pipe(stylus().on('error', function(err) {console.error(err);}))
        .pipe(autoprefixer())
        .pipe(gulp.dest('build/'));
});

gulp.task('yate-runtime', function() {
    return gulp.src('node_modules/yate/lib/runtime.js')
	.pipe(gulp.dest('./build/js'));
});

gulp.task('js', ['yate'], function() {
    return gulp.src('client/js/main.js')
        .pipe(browserify({
            insertGlobals: true,
            require: [
                '../../node_modules/yate/lib/runtime'
            ],
            shim: {
                yr: {
                    path: 'node_modules/yate/lib/runtime',
                    exports: 'yr'
                }
            }
        }))
        .pipe(gulp.dest('./build/js'))
});

gulp.task('html', function() {
    return gulp.src('client/index.html')
        .pipe(gulp.dest('./build/'));
});

gulp.task('watch', ['default'], function() {
    gulp.watch('client/js/*.js', ['js']);
    gulp.watch('client/templates/*.yate', ['yate']);
    gulp.watch('client/index.html', ['html']);
    gulp.watch('client/*.styl', ['styl']);
});

gulp.task('default', ['html', 'js', 'styl', 'yate-runtime'], function() {
    console.log('default');
});

gulp.task('clean', function() {
    exec('rm -rf build/ main.css');
});
