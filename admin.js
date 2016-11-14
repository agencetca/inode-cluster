//v0.2
//TODO add md5 verification to cache management in order to redownload files if anomalies exist
//TODO autosave a copy of config.json files before writing them and restore things if anomalies exist (preserve atomicity)
//TODO find a way to handle any internet interuption during node creation (that involve some downloads, i.e npm and bower install)


//Constant declaration
const inquirer = require('inquirer');
const jsonfile = require('jsonfile')
const mkdirp = require('mkdirp');
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const request = require('request');
const colors = require('colors');
const exec = require('child_process').exec;
const execSync = require('child_process').execSync;
const validUrl = require('valid-url');
const promptSync = require('readline-sync').question;
const portscanner = require('portscanner');
const spawn = require('child_process').spawn;
const emptyDir = require('empty-dir');
const md5 = require("nodejs-md5");
const ProgressBar = require('progress');
const isOnline = require('is-online');

const github = {
    "url": "https://github.com/agencetca",
    "cluster-repo": "inode-cluster",
    "server-repo": "inode-server",

}

var config = {};
var config_file = '';
var range_port = [8000,10000];
var isCluster = null;
var target_dir = null;
var cluster_name = '';
var choice_menu = [];
var run = {};
var run_folder = '';
var run_file = '';
var cache_folder = '';
var args = false;


var readArguments = function(cbk) {


    if(process.argv[2]) {
        args = true;

        if(process.argv[2] === 'save') {
            var message = process.argv[3] || 'various (automated)';
            exec('git add . && git commit -m "'+message+'" && git push -u origin master', (err, stdout, stderr) => {
                if(err && err.code === 1) {
                    exec('git push -u origin master', (err, stdout, stderr) => {
                        if(err) console.log(err.code);
                        if(cbk) cbk(args);
                    });
                } else {
                    if(err) console.log(err.code);
                    if(cbk) cbk(args);
                }
            });
        }

    } else {
        if(cbk) cbk(args);
    }

}

var define = {
    folder : {
        target : function(cbk,args) {
            if(path.basename(__dirname) === 'admin' && path.basename(path.join(__dirname,'/..')) === 'system' ) {
                target_dir += '/../..';
            } else {
                target_dir = __dirname;
            }

            if(cbk) cbk(args);

        }
    },
    file : {
        config : function(cbk,args) {
            config_file = target_dir+'/config.json';
            if(cbk) cbk(args);
        }
    },
    data : {
        config : function(cbk,args) {
            if (fs.existsSync(config_file)) { 
                try {
                    config = require(config_file);
                } catch(e) {
                    config = {};
                }
            }

            if(cbk) cbk(args);
        }
    }
}

var write = {
    file : {
        config : function(cbk,args) {

            jsonfile.writeFile(config_file, config, {spaces: 2}, function(err) {
                //if (err) throw(err);
                if(cbk) cbk(args);
            });
        }
    }
}

var read = {
    file : {
        config : function(cbk, args) {
            var cf = require(config_file);
            if(cbk) cbk(cf, args);
        }
    },
    data : {
        config : function(cbk, args) {
            if(config) cbk(config, args);
        }
    }
}

var clean = {
    config : function() {

        if(config.servers) {
            //Clean deleted servers
            for(var serv in config.servers) {
                if (!fs.existsSync(target_dir+'/servers/'+serv)) { 
                    delete config.servers[serv];
                }
            }
        }

        if(config['third-part-servers']) {
            //Clean deleted third-part servers
            for(var i=0; i<config['third-part-servers'].length; i++) {
                if (!fs.existsSync(target_dir+'/servers/third-part-servers/'+config['third-part-servers'][i])) { 
                    config['third-part-servers'].splice(i, 1);
                }
            }
        }

    }
}

var detect = {
    servers : {
        exist : function() {
            if(config && config.servers && Object.keys(config.servers).length) {
                return true;
            } else {
                return false;
            }
        }
    }
}

var loadMenu = function() {

    choice_menu = [];

    if(isCluster) {
        if (config && config.servers && detect.servers.exist()) {
            choice_menu = choice_menu.concat([
                    "Add a node",
                    "Start the cluster",
                    "Restart the cluster",
                    "Stop the cluster",
                    "Inspect a node"
            ]);
        } else {
            choice_menu = choice_menu.concat([
                    "Add a node"
            ]);
        }
    } else if(isPicoService) {
        choice_menu = choice_menu.concat([
                "Activate interface",
                "Add a local functionality",
                "Expose a local functionality (api)",
                "Expose a remote functionality",
                "Build a third-part-server"
        ]);
    } else if(isApplication) {
        choice_menu = choice_menu.concat([
                "Activate interface",
                "Link picoservice"
        ]);
    }
}

var doIt = {
    ifInternetIs : {
        offline : function(cbk) {
            cbk();
        },
        online : function(cbk, hook) {

            isOnline(function(err, online) {
                if (online || hook === true) {
                    cbk();
                } else {
                    console.log('This application needs a valid internet connection. Abort'.red);
                }
            });
        }
    }
}

//Cache Management
var build_cache = function(cbk,verbose) {

    doIt.ifInternetIs.online(function() {

        if (!fs.existsSync(cache_folder)) { 
            var bar = new ProgressBar(':bar', { total : Object.keys(github).length-1});
            var silent = '>/dev/null 2>&1';
            bar.tick();
            execSync('git clone '+github.url+'/'+github["cluster-repo"]+'.git '+cache_folder+'/'+github["cluster-repo"]+' '+silent, (err, stdout, stderr) => {
                if(err) throw(err);
            });
            bar.tick();
            execSync('git clone '+github.url+'/'+github["server-repo"]+'.git '+cache_folder+'/'+github["server-repo"]+' '+silent, (err, stdout, stderr) => {
                if(err) throw(err);
            });

            if(verbose) console.log('Cache built'.yellow);
        } else {
            if(verbose) console.log('Cache already exists'.yellow);
        }

        if(cbk) cbk();
    }, fs.existsSync(cache_folder));
}

var delete_cache = function(cbk, verbose) {
    if (fs.existsSync(cache_folder)) { 
        var silent = '>/dev/null 2>&1';
        execSync('rm -rf '+cache_folder, (err, stdout, stderr) => {
            if(err) throw(err);
        });
        if(verbose) console.log('Cache deleted!'.yellow);
        if(cbk) cbk();
    } else {
        if(verbose) console.log('There\'s no cache'.yellow);
        if(cbk) cbk();
    }
}

var ensure_cache = function(cbk,verbose) {

    //TODO insert MD5 check

    build_cache(function() {
        if(cbk) cbk(function(verbose) {
            if(verbose) console.log('Cache is ready'.yellow);
        },verbose);
    }, verbose);

}

var reset_cache = function(cbk, verbose) {
    delete_cache(function() {
        build_cache(function() {
            cbk();
        }, false);
    }, false);
}

//Process

function get_available_port(host,range,cbk) {
    if(host === 'localhost') host = '127.0.0.1';
    if(range.split) range = range.split('-');
    portscanner.findAPortNotInUse(range[0], range[1], host, function(error, port) {
        if(error) throw(error);
        cbk(port);
    })
}

function large_display(message) {
    console.log('\n**** '+message+' ****\n');
}

function back_to_main(message) {
    large_display(message);
    main();
}

function overWrite(item, callback) {

    fs.stat(item, function(err, stat) {
        if(err == null) {
            large_display('Item '+item+' exists');
            inquirer.prompt([{
                type: 'list',
                name: 'overwrite',
                message: 'Overwrite?',
                choices: ['yes','no'],
                default: 'no'
            }]).then(function (answers) {
                if(answers.overwrite === 'yes') {
                    callback();
                }
            });
        } else {
            callback();
        }
    });
}

var reloadConfig = function(cbk) {

    delete require.cache[config_file];
    config = require(config_file);
    loadMenu();
    if(cbk) cbk();

}

var cluster = {
    start : function(cbk) {

        if(config && run && run[config.name] && run[config.name].length) {
            console.log(colors.yellow('The Cluster is already running.'));
            main();
            return;
        } else if(config && (!config.servers || !detect.servers.exist())) {
            console.log('No servers available'.red);
            main();
            return;
        }

        var timer = 0;

        for(var serv in config.servers) {
            if(fs.existsSync(target_dir+'/servers/'+serv+'/app.js')) {

                timer += 700;

                const proc = spawn('node', [target_dir+'/servers/'+serv+'/app.js',false], {
                    detached: true,
                    stdio: ['ignore',process.stdout,'ignore']
                });

                if(!run[config.name]) {
                    run[config.name] = [];
                }

                run[config.name].push(proc.pid);

            } else {
                console.log('Server seems broken, no app.js found'.yellow,'Abort'.red);
            }

        }

        jsonfile.writeFile(run_file, run, {spaces: 2}, function(err) {
            if(err) throw(err);
            setTimeout(function() {
                console.log('');//important
                if(cbk) {
                    cbk();
                    return;
                } else {
                main();
                }
            },timer);
        });

    },
    stop : function(cbk) {

        if(config && run && run[config.name] && !run[config.name].length) {
            console.log(colors.yellow('The Cluster is already stopped.'));
            main();
            return;
        } else if(config && (!config.servers || !detect.servers.exist())) {
            console.log('No servers available'.red);
            main();
            return;
        }

        while(run[config.name].length) {
            exec('kill '+run[config.name].shift(), (err, stdout, stderr) => {
                //if(err) throw(err);
            });
        }

        jsonfile.writeFile(run_file, run, {spaces: 2}, function(err) {
            if(err) throw(err);
            setTimeout(function() {
                if(cbk) {
                    cbk();
                    return;
                } else {
                    main();
                }
            },800);
        });

    },
    restart : function() {
        cluster.stop(function() {
            cluster.start();
        });
    }
}

function main() {

    reloadConfig(function() {

        inquirer.prompt([{
            type: 'list',
            name: 'options',
            message: 'What do you want to do?',
            choices: choice_menu.concat([
                    new inquirer.Separator(),
                    "Reset cache",
                    "Quit"
            ])
        }]).then(function (answers) {
            switch(answers.options) {

                case 'Inspect a node':

                    if(!config.servers || !detect.servers.exist()) {
                        console.log('No servers available'.red);
                        main();
                        return;
                    }

                    var history = [];
                    var selected = '';
                    var select = {};
                    var methods = {
                        'back' : function() {

                            if(ask && history.length) {
                                ask(history.shift());
                            } else {
                                main();
                            }
                        },
                        'message' : function(msg, cbk) {

                            if(typeof msg === 'function') {
                                msg = msg.toString();
                            } 

                            console.log('\n');
                            console.log(msg);
                            console.log('\n');
                            cbk();
                        },
                            'list-files-in-dir' : function(dir,cbk) {
                                fs.readdir(dir, (err, files) => {
                                    cbk(files);
                                })
                            },
                        'config' : function(name) {
                            var config = require(target_dir+'/servers/'+name+'/config.json');
                            methods.message(config, function() {
                                methods.back();
                            });
                        },
                        'routes' : function(name) {
                            methods['list-files-in-dir'](target_dir+'/servers/'+name+'/routes', function(files) {
                                var sel = [];
                                var pattern = new RegExp('.*\.js');
                                files.forEach(file => {
                                    if(file.match(pattern)) sel.push(file);
                                });
                                ask({
                                    type: 'list',
                                    message: 'Select a route',
                                    choices: sel,
                                    callback : function(choice) {
                                        var payload = require(target_dir+'/servers/'+name+'/routes/'+choice);
                                        methods.message(payload, function() {
                                            methods.back();
                                        });
                                    }
                                });
                            });
                        },
                        'middlewares' : function(name) {
                            methods['list-files-in-dir'](target_dir+'/servers/'+name+'/middlewares', function(files) {
                                var sel = [];
                                var pattern = new RegExp('.*\.js');
                                files.forEach(file => {
                                    if(file.match(pattern)) sel.push(file);
                                });
                                ask({
                                    type: 'list',
                                    message: 'Select a middleware',
                                    choices: sel,
                                    callback: function(choice) {
                                        var payload = require(target_dir+'/servers/'+name+'/middlewares/'+choice);
                                        methods.message(payload, function() {
                                            methods.back();
                                        });
                                    }
                                });
                            });
                        }
                    };

                    function ask(question) {

                        if(question.before) {
                            question.before();
                        }

                        var back = "back";
                        question.name = 'q';

                        if(question.choices) {
                            question.choices.push(
                                    back
                                    );
                        }

                        var que = question.message;
                        if(selected) {
                            question.message = 'Server : "'+selected+'" - '+que;
                        }

                        inquirer.prompt(question).then(function (answers) {

                            question.message = que;
                            question.choices.pop();
                            if(answers['q'] === back) {
                                methods['back']();
                                return;
                            } else {
                                history.unshift(question);
                            }

                            if(select.single && select.single[answers['q']]) {
                                ask(select.single[answers['q']]);
                            } else if(config && config.servers && config.servers[answers['q']]) {
                                selected = answers['q'];
                                ask(select.single.menu);
                            } else {
                                if (selected && methods[answers['q']] && typeof methods[answers['q']] === 'function') {
                                    methods[answers['q']](selected);
                                } else {
                                    if(question.callback) {
                                        question.callback(answers['q']);
                                    } else {
                                        console.log('Nothing to do');
                                    }
                                }
                            }
                        });
                    }

                    select.list = {
                        type: 'list',
                        message: 'Choose a server',
                        before : function() {
                            selected = '';
                        },
                        choices: Object.keys(config.servers)
                    };

                    select.single = {
                        menu : {
                            type: 'list',
                            message: 'Menu',
                            choices: [
                                'info',
                                'update',
                                'upgrade'
                            ]
                        },
                        info : {
                            type: 'list',
                            message: 'View',
                            choices: [
                                'config',
                                'routes',
                                'middlewares'
                            ]
                        },
                        update : {
                            type: 'list',
                            message: 'Update',
                            choices: [
                                'thing to update 1',
                                'thing to update 2',
                                'thing to update 3'
                            ]
                        },
                        upgrade : {
                            type: 'list',
                            message: 'Upgrade',
                            choices: [
                                'thing to upgrade 1',
                                'thing to upgrade 2',
                                'thing to upgrade 3'
                            ]
                        }

                    };

                    ask(select.list);

                    break;

                case 'Start the cluster':

                    cluster.start();

                    break;

                case 'Restart the cluster':

                    cluster.restart();

                    break;

                case 'Stop the cluster':

                    cluster.stop();

                    break;

                case 'Add a node':

                    var _config = {};

                    doIt.ifInternetIs.online(function() {

                        //ensure_cache(function() {
                        if (config) { 
                            if(config['port-range']) {
                                if(config['port-range'].split && config['port-range'].split('-')) {
                                    range_port = config['port-range'].split('-');
                                }
                            } else {
                                config['port-range'] = range_port.join('-');
                            }
                        } else {
                            config['port-range'] = range_port.join('-');
                        }

                        if(!config.servers) {
                            config.servers = {};
                        }

                        var range_container = [];
                        var current_range = '';
                        var arr = Object.keys(config.servers);
                        const totalPortNum = parseInt(range_port[1] - range_port[0],10);
                        const totalServNum = arr.length+1;
                        var servNum, minNum, maxNum, rangeNum;
                        for(var i=0; i<totalServNum; i++) {
                            servNum = i+1;
                            rangeNum = Math.floor(totalPortNum / totalServNum);
                            maxNum = parseInt(range_port[0],10) + rangeNum * servNum;
                            minNum = maxNum - rangeNum;
                            maxNum--;
                            range_container.push(minNum+'-'+maxNum);
                        }

                        current_range = range_container.pop();
                        var range_item = '';
                        var tmp_s = [];
                        for (var serv in config.servers) {
                            tmp_s.push(serv);
                            range_container.push(range_item = range_container.shift());
                            get_available_port(config.servers[serv].split(':')[0],range_item,function(av_port) {
                                var _serv = tmp_s.shift();
                                config.servers[_serv] = config.servers[_serv].split(':')[0]+':'+av_port;
                            });
                        }

                        get_available_port('localhost',current_range.split('-'),function(next_port) {

                            var server = [
                            {
                                type: 'input',
                                name: 'name',
                                message: 'Node name?*',
                                validate: function(str){

                                    if(!str) {
                                        return 'Node name can\'t be null';
                                    }

                                    if (fs.existsSync(target_dir+'/servers/'+str)) {
                                        return 'This name is already taken';
                                    } else {
                                        return !!str;
                                    }
                                }
                            },
                            {
                                type: 'input',
                                name: 'description',
                                message: 'Description?',
                                default: 'none',
                                         validate: function(str){
                                             return !!str;
                                         }
                            },
                                {
                                    type: 'input',
                                    name: 'licence',
                                    message: 'Licence?',
                                    default: 'none',
                                             validate: function(str){
                                                 return !!str;
                                             }
                                },
                                {
                                    type: 'input',
                                    name: 'owner',
                                    message: 'Owner?',
                                    default: 'none',
                                             validate: function(str){
                                                 return !!str;
                                             }
                                },
                                    {
                                        type: 'input',
                                        name: 'host',
                                        message: 'Host and Port Number? [localhost:'+next_port+'] ',
                                        validate: function(str){
                                            if(!str) {
                                                return true;
                                            } else if(str.split(':').length === 2) {
                                                return true;
                                            }
                                        }
                                    },
                                    {
                                        type: 'input',
                                        name: 'static',
                                        message: 'Activate interface?* [true|false]',
                                        validate: function(str){
                                            if (str === 'true' || str === 'false') {
                                                return true;
                                            }
                                        }
                                    }
                            ];

                            inquirer.prompt(server).then(function(resp) {

                                if(!resp.host) {
                                    resp.host = 'localhost:'+next_port;
                                }

                                if(resp.static === 'true') {
                                    while (!validUrl.isUri(resp['static-app-url']) && resp['static-app-url'] !== ''){
                                        resp['static-app-url'] = promptSync('?'.green+' Static app Github url: '.bold.white);
                                    }
                                    if (!validUrl.isUri(resp['static-app-url'])){
                                        resp['static-app-url'] = null;
                                    }
                                }

                                finalize_process = function() {

                                    write.file.config(function() {

                                        var objs = [];
                                        for(var serv in config.servers) {
                                            if(serv === resp.name) {
                                                _config['port-range'] = current_range;
                                                jsonfile.writeFile(target_dir+'/servers/'+resp.name+'/config.json', _config, {spaces: 2}, function(err) {
                                                    if(err) console.error(err);
                                                        exec('cd '+target_dir+'/servers/'+resp.name+' && npm install', function(err, stdout, stderr) {
                                                            if(err) console.error(err);
                                                            var asterisk = '*';//'coz vim sucks
                                                            exec('mkdir '+target_dir+'/servers/'+resp.name+'/system/admin && cp -r '+cache_folder+'/'+github["cluster-repo"]+'/'+asterisk+' '+target_dir+'/servers/'+resp.name+'/system/admin', function (error, stdout, stderr) {
                                                                if(err) console.error(err);
                                                                console.log(colors.green('Inode '+resp.name+' has been installed!'));
                                                                if(resp.static === 'true') {
                                                                    emptyDir(target_dir+'/servers/'+resp.name+'/'+_config['static-root'], 
                                                                            function(err, result) {
                                                                                if (err) {
                                                                                    console.error(err);
                                                                                }

                                                                                if(result){
                                                                                    console.log(colors.yellow('Interface '+
                                                                                                'is activated, but empty. '+
                                                                                                'Place client-side files into : "'+
                                                                                                _config['static-root']+'".'));
                                                                                }

                                                                                main();

                                                                            });

                                                                } else {
                                                                    main();
                                                                }
                                                            });
                                                        });
                                                });

                                            } else {

                                                objs.push(require(target_dir+'/servers/'+serv+'/config.json'));
                                                var o = objs.shift();
                                                o['port-range'] = range_container.shift();
                                                o['port'] = o['port-range'].split('-')[0];
                                                jsonfile.writeFile(target_dir+'/servers/'+serv+'/config.json', o, {spaces: 2}, function(err) {
                                                    if(err) console.error(err);
                                                });

                                            }
                                        }

                                    });
                                }

                                config.servers[resp.name] = resp.host;

                                define.file.config(function(err) {
                                    if(err) console.error(err);

                                    mkdirp(target_dir+'/servers/', function(err) { 
                                        if (err) throw err;
                                    });

                                    var asterisk = '*';//'coz vim sucks
                                    exec('mkdir '+target_dir+'/servers/'+resp.name+' && cp -r '+cache_folder+'/'+github["server-repo"]+'/'+asterisk+' '+target_dir+'/servers/'+resp.name,(error, stdout, stderr) => {
                                        if(error) console.log(error);

                                        _config.name = resp.name;
                                        _config.type = 'server';
                                        _config.owner = resp.owner;
                                        _config.description = resp.description;
                                        _config.licence = resp.licence || 'none';
                                        _config.port = resp.host.split(':')[1];
                                        _config['static-content-enabled'] = resp.static;

                                        if(_config['static-content-enabled'] === 'true') {

                                            _config['static-root'] = 'static';
                                            _config['static-entry-point'] = 'index.html';

                                            mkdirp(target_dir+'/servers/'+resp.name+'/'+_config['static-root'], function(err) { 
                                                if (err) throw err;
                                            });
                                        } 

                                        if(resp['static-app-url']) {
                                            _config['static-origin'] = resp['static-app-url'];
                                            var static_abs_path = path.join(target_dir+'/servers/'+resp.name+'/'+_config['static-root']);
                                                exec('git clone '+_config["static-origin"]+' '+static_abs_path, (error, stdout, stderr) => {
                                                    if(error) throw(error);
                                                    var fflag=0;
                                                    var finder = require('findit')(static_abs_path);
                                                    finder.on('file', function (file) {
                                                        if(path.basename(file) === _config['static-entry-point'] && fflag === 0) {
                                                            fflag=1;
                                                            var pattern = new RegExp('.*'+resp.name+'\/?')
                                                                _config['static-root'] = path.dirname(file.replace(pattern,''));
                                                        } else if (path.basename(file) === 'bower.json') {
                                                                exec('cd '+path.dirname(file)+' && bower install', (error, stdout, stderr) => {
                                                                    if(error) throw error;
                                                                });
                                                        } else if (path.basename(file) === 'package.json') {
                                                                exec('cd '+path.dirname(file)+' && npm install', (error, stdout, stderr) => {
                                                                    if(error) throw error;
                                                                });
                                                        }
                                                    });
                                                    finder.on('error', function (error) {
                                                        if(error) throw(error);
                                                    });
                                                    finder.on('end', function () {
                                                        finalize_process();
                                                    });
                                                });
                                        } else {
                                            finalize_process();
                                        }

                                    });
                                });
                            });
                        }); 
                        //},false);

                    });


                    break;

                case 'Build a third-part-server':

                    var third_part_server = [
                    {
                        type: 'input',
                        name: 'name',
                        message: 'Server name?*',
                        validate: function(str){
                            return !!str;
                        }
                    },
                    {
                        type: 'input',
                        name: 'description',
                        message: 'Description?*',
                        validate: function(str){
                            return !!str;
                        }
                    },
                        {
                            type: 'input',
                            name: 'owner',
                            message: 'Owner?*',
                            validate: function(str){
                                return !!str;
                            }
                        },
                        {
                            type: 'input',
                            name: 'licence',
                            message: 'Licence?',
                            default: 'none',
                                     validate: function(str){
                                         return !!str;
                                     }
                        },
                            {
                                type: 'input',
                                name: 'editor',
                                message: 'Your favorite code editor?',
                                default: 'vim',
                                         validate: function(str){
                                             return !!str;
                                         }
                            }
                    ];

                    mkdirp(target_dir+'/servers/third-part-servers', function(err) { 
                        if (err) throw err;
                    });

                    inquirer.prompt(third_part_server).then(function(resp) {

                        if(!config['third-part-servers']) {
                            config['third-part-servers'] = [];
                        }

                        config['third-part-servers'].push(resp.name+'.js');

                        define.file.config(function(err) {
                            if(err) console.error(err)
                                exec('echo "/*Name : '+
                                        resp.name+'\ndescription : '+
                                        resp.description+'\nLicence : '+
                                        resp.licence +'*/\n" > '+
                                        target_dir+'/servers/third-part-servers/'+
                                        resp.name+'.js', (error, stdout, stderr) => {

                                            console.log('Execute '+resp.editor+' '+target_dir+'/servers/third-part-servers/'+resp.name+'.js'); 

                                        });
                        })

                    });

                    break;

                case 'Add a local functionality':

                    var middleware = [
                    {
                        type: 'input',
                        name: 'name',
                        message: 'Middleware name?*',
                        validate: function(str){
                            return !!str;
                        }
                    },
                    {
                        type: 'input',
                        name: 'description',
                        message: 'Description?*',
                        validate: function(str){
                            return !!str;
                        }
                    },
                        {
                            type: 'input',
                            name: 'developper',
                            message: 'Developper?*',
                            validate: function(str){
                                return !!str;
                            }
                        },
                        {
                            type: 'input',
                            name: 'licence',
                            message: 'Licence?',
                            default: 'none',
                                     validate: function(str){
                                         return !!str;
                                     }
                        },
                            {
                                type: 'input',
                                name: 'editor',
                                message: 'Your favorite code editor?*',
                                validate: function(str){
                                    return !!str;
                                }
                            }
                    ];

                    inquirer.prompt(middleware).then(function(resp) {

                        overWrite(target_dir+'/middlewares/'+resp.name+'.js', function() {
                            fs.writeFile(target_dir+'/middlewares/'+resp.name+'.js', 
                                    '/*\n'+
                                       ' * description : '+resp.description+'\n'+
                                       ' * Author : '+resp.developper+'\n'+
                                       ' * Licence : '+resp.licence+'\n'+
                                       '*/\n\n'+
                                    'module.exports = function(req, res, next) {'+
                                        '\n\t'+
                                            '\n\t'+
                                            '\n\tnext();'+
                                            '\n\t'+
                                            '\n};', function(err) {
                                                if(err) {
                                                    return console.log(err);
                                                }
                                                var child = child_process.spawn(resp.editor, [target_dir+'/middlewares/'+resp.name+'.js'], {
                                                    stdio: 'inherit'
                                                });

                                                child.on('exit', function (e, code) {
                                                    back_to_main('The file was saved!');
                                                });
                                            }); 
                        });


                    });

                    break;

                case 'Expose a local functionality (api)':

                    if (!fs.existsSync(target_dir+'/middlewares/')) {
                        console.log('Create a middleware first'.red);
                        main();
                        return;
                    }

                    var _route = {};

                    inquirer.prompt([{
                        type: 'list',
                        name: 'method',
                        message : 'select a method',
                        choices: ['get', 'post']
                    }]).then(function (answers) {

                        _route.method = answers.method;

                        switch(answers.method) {
                            case 'get':
                            case 'post':

                                fs.readdir(target_dir+'/middlewares/', function (err, files) {

                                    if(err) throw(err);

                                    var middlewares = [];
                                    for(var i=0; i<files.length; i++) {
                                        if(path.extname(files[i]) === '.js') {
                                            middlewares.push({ 'name' : files[i].slice(0,-3) });
                                        }
                                    }

                                    if(middlewares.length) {

                                        inquirer.prompt([{
                                            type: 'checkbox',
                                            name: 'middlewares',
                                            message : 'Which middleware(s) do you want to expose?',
                                            choices: middlewares
                                        }]).then(function (answers) {

                                            _route.middlewares = answers.middlewares;

                                            for(var md in _route.middlewares) {
                                                console.log(parseInt(md,10)+1 +')'+_route.middlewares[md]);
                                            }

                                            inquirer.prompt([{
                                                type: 'input',
                                                name: 'order',
                                                message : 'Specify order?'
                                            }]).then(function (answers) {

                                                var chain = '';
                                                for(var i=0; i<answers.order.length; i++) {
                                                    if(i === answers.order.length-1) {
                                                        chain += 'middlewares["'+_route.middlewares[parseInt(answers.order[i],10)-1]+'"]';
                                                    } else {
                                                        chain += 'middlewares["'+_route.middlewares[parseInt(answers.order[i],10)-1]+'"]->';
                                                    }
                                                }

                                                console.log(chain);
                                                _route.target = (chain.split('->')[chain.split('->').length-1]).split('.')[1];
                                                _route.targets = chain.split('->').join(', ');

                                                inquirer.prompt([{
                                                    type: 'input',
                                                    name: 'main',
                                                    message : 'Route name?',
                                                    default : _route.target 
                                                }]).then(function (answers) {

                                                    overWrite(target_dir+'/routes/'+answers.main+'-'+_route.method+'.js', function() {
                                                        fs.writeFile(target_dir+'/routes/'+answers.main+'-'+_route.method+'.js', ''+
                                                                'module.exports = function(app, config, middlewares) {'+
                                                                    '\n'+
                                                                        '\n\tapp.'+_route.method+'("/'+answers.main+'", '+_route.targets+', function(req, res) {'+
                                                                            '\n\n\t\tres.end();'+
                                                                                '\n\t});'+
                                                                        '\n'+
                                                                        '\n};'+
                                                                        '', function(err) {
                                                                            if(err) {
                                                                                return console.log(err);
                                                                            }

                                                                            back_to_main("The file was saved!");
                                                                        }); 
                                                    });

                                                });
                                            });

                                        });

                                    } else {
                                        back_to_main('Sorry no middleware available.');
                                    }
                                });

                                break;
                            default:
                                break;
                        }

                    }); 

                    break;

                case 'Expose a remote functionality':

                    var _route = {};

                    fs.readdir(target_dir+'/middlewares/', function (err, files) {

                        _route.middlewares = [];

                        if(!err) {

                            for(var i=0; i<files.length; i++) {
                                if(path.extname(files[i]) === '.js') {
                                    _route.middlewares.push({ 'name' : files[i].slice(0,-3) });
                                }
                            }

                        }

                        inquirer.prompt([{
                            type: 'input',
                            name: 'host',
                            message : 'Specify the remote host:'
                        },{
                            type: 'input',
                            name: 'port',
                            message : 'Specify the remote port to use:'
                        }]).then(function (answers) {

                            _route.host = 'http://'+answers.host+':'+answers.port;

                            request.get(_route.host+'/api', function(error, response, body) {
                                if(error) throw error;
                                inquirer.prompt([{
                                    type: 'list',
                                    name: 'target',
                                    message : 'Select a remote api to use :',
                                    choices : body.split('\n')
                                }]).then(function (answers) {

                                    _route.method = answers.target.split(' ')[1].toLowerCase();
                                    _route.target = answers.target.split(' ')[2];

                                    var mode_list=['grasp data'];
                                    if(_route.method === 'get') {
                                        mode_list.push('proxify request');
                                    }

                                    inquirer.prompt([{
                                        type: 'list',
                                        name: 'mode',
                                        message : 'Choose a mode:',
                                        choices : mode_list
                                    }]).then(function (answers) {

                                        switch(answers.mode) {
                                            case 'grasp data':

                                                inquirer.prompt([{
                                                    type: 'input',
                                                    name: 'local-name',
                                                    message : 'Local route name?',
                                                    default : _route.target
                                                },{
                                                    type: 'list',
                                                    name: 'local-method',
                                                    message : 'select a local method',
                                                    default: _route.method,
                                                             choices: ['get', 'post']
                                                }]).then(function (answers) {

                                                    _route['local-name'] = answers['local-name'];
                                                    _route['local-method'] = answers['local-method'];

                                                    switch(_route['local-method']) {
                                                        case 'get':
                                                            _route.data = 'req.query';
                                                            break;

                                                        case 'post':
                                                            _route.data = 'req.body';
                                                            break;

                                                        default:
                                                            _route.data = '{}';
                                                            break;
                                                    }

                                                    function finish_process_wo_middleware () {

                                                        overWrite(target_dir+'/routes/'+_route['local-name']+'-'+_route['local-method']+'.js', function() {
                                                            fs.writeFile(target_dir+'/routes/'+_route['local-name']+'-'+_route['local-method']+'.js', ''+
                                                                    'const request = require("request");\n\n'+
                                                                    'module.exports = function(app, config, middlewares) {\n\n'+
                                                                        '\tapp.'+_route['local-method']+'("/'+_route['local-name']+'", function(req, res) {\n\n'+
                                                                            '\t\trequest({\n'+
                                                                                '\t\t\turl: "'+_route.host+'/'+_route.target+'", //URL to hit\n'+
                                                                                '\t\t\t\tqs: '+_route.data+', //Query string data\n'+
                                                                                '\t\t\t\tmethod: "'+_route.method+'",\n'+
                                                                                    '\t\t\t\t//headers: {\n'+
                                                                                    '\t\t\t\t//    "Content-Type": "MyContentType",\n'+
                                                                                    '\t\t\t\t//    "Custom-Header": "Custom Value"\n'+
                                                                                    '\t\t\t\t//},\n'+
                                                                                    '\t\t\t\tbody: "Hello Hello! String body!" //Set the body as a string\n'+
                                                                                    '\t\t\t}, function(error, response, body){\n'+
                                                                                        '\t\t\t\tif(error) {\n'+
                                                                                            '\t\t\t\t\tconsole.log(error);\n'+
                                                                                                '\t\t\t\t} else {\n'+
                                                                                                    '\t\t\t\t\tres.write(body);\n'+
                                                                                                        '\t\t\t\t}\n\n'+
                                                                                                        '\t\t\t\tres.end();\n'+
                                                                                                        '\t\t});\n'+
                                                                                '\t});\n'+
                                                                            '}\n'+
                                                                            '', function(err) {
                                                                                if(err) {
                                                                                    return console.log(err);
                                                                                }

                                                                                back_to_main("The file was saved!");
                                                                            }); 

                                                        });

                                                    }

                                                    if (_route.middlewares.length) {

                                                        inquirer.prompt([{
                                                            type: 'list',
                                                            name: 'inject',
                                                            message : 'Do you want to inject some middleware(s) locally?',
                                                            choices: ['yes','no']
                                                        }]).then(function (answers) {
                                                            if(answers.inject === 'yes') {
                                                                inquirer.prompt([{
                                                                    type: 'checkbox',
                                                                    name: 'middlewares',
                                                                    message : 'Select local middleware(s):',
                                                                    choices: _route.middlewares
                                                                }]).then(function (answers) {

                                                                    _route._middlewares = answers.middlewares;

                                                                    for(var md in _route._middlewares) {
                                                                        console.log(parseInt(md,10)+1 +')'+_route._middlewares[md]);
                                                                    }

                                                                    inquirer.prompt([{
                                                                        type: 'input',
                                                                        name: 'order',
                                                                        message : 'Specify order?'
                                                                    }]).then(function (answers) {

                                                                        var chain = '';
                                                                        for(var i=0; i<answers.order.length; i++) {
                                                                            if(i === answers.order.length-1) {
                                                                                chain += 'middlewares["'+_route._middlewares[parseInt(answers.order[i],10)-1]+'"]';
                                                                            } else {
                                                                                chain += 'middlewares["'+_route._middlewares[parseInt(answers.order[i],10)-1]+'"]->';
                                                                            }
                                                                        }

                                                                        if(_route._middlewares.length) {
                                                                            console.log(chain);
                                                                            _route.targets = ' '+chain.split('->').join(', ')+', ';
                                                                        } else {
                                                                            _route.targets = '';
                                                                        }

                                                                        overWrite(target_dir+'/routes/'+_route['local-name']+'-'+_route['local-method']+'.js', function() {
                                                                            fs.writeFile(target_dir+'/routes/'+_route['local-name']+'-'+_route['local-method']+'.js', ''+
                                                                                    'const request = require("request");\n\n'+
                                                                                    'module.exports = function(app, config, middlewares) {\n\n'+
                                                                                        '\tapp.'+_route['local-method']+'("/'+_route['local-name']+'",'+_route.targets+' function(req, res) {\n\n'+
                                                                                            '\t\trequest({\n'+
                                                                                                '\t\t\turl: "'+_route.host+'/'+_route.target+'", //URL to hit\n'+
                                                                                                '\t\t\t\tqs: '+_route.data+', //Query string data\n'+
                                                                                                '\t\t\t\tmethod: "'+_route.method+'",\n'+
                                                                                                    '\t\t\t\t//headers: {\n'+
                                                                                                    '\t\t\t\t//    "Content-Type": "MyContentType",\n'+
                                                                                                    '\t\t\t\t//    "Custom-Header": "Custom Value"\n'+
                                                                                                    '\t\t\t\t//},\n'+
                                                                                                    '\t\t\t\tbody: "Hello Hello! String body!" //Set the body as a string\n'+
                                                                                                    '\t\t\t}, function(error, response, body){\n'+
                                                                                                        '\t\t\t\tif(error) {\n'+
                                                                                                            '\t\t\t\t\tconsole.log(error);\n'+
                                                                                                                '\t\t\t\t} else {\n'+
                                                                                                                    '\t\t\t\t\tres.write(body);\n'+
                                                                                                                        '\t\t\t\t}\n\n'+
                                                                                                                        '\t\t\t\tres.end();\n'+
                                                                                                                        '\t\t});\n'+
                                                                                                '\t});\n'+
                                                                                            '}\n'+
                                                                                            '', function(err) {
                                                                                                if(err) {
                                                                                                    return console.log(err);
                                                                                                }

                                                                                                back_to_main("The file was saved!");
                                                                                            }); 

                                                                        });
                                                                    });

                                                                });

                                                            } else {

                                                                finish_process_wo_middleware();

                                                            }

                                                        });

                                                    } else {
                                                        finish_process_wo_middleware();
                                                    }

                                                });

                                                break;

                                            case 'proxify request':

                                                inquirer.prompt([{
                                                    type: 'input',
                                                    name: 'local-name',
                                                    message : 'Route name?',
                                                    default : _route.target
                                                }]).then(function (answers) {

                                                    switch(_route.method) {
                                                        case 'get':
                                                            _route.data = 'req.query';
                                                            break;

                                                        case 'post':
                                                            _route.data = 'req.body';
                                                            break;

                                                        default:
                                                            _route.data = '{}';
                                                            break;
                                                    }

                                                    var patch_request = '';
                                                    var target;

                                                    if(_route.target !== answers['local-name']) { 
                                                        patch_request += '\t\tvar params = (req.url.split && req.url.split("?").length === 2) ? "?"+req.url.split("?")[1] : "";\n\t\treq.url="";\n';
                                                        target = '"'+_route.host+'/'+_route.target+'"+params';
                                                    } else {
                                                        target = '"'+_route.host+'"';
                                                    }

                                                    overWrite(target_dir+'/routes/'+answers['local-name']+'-'+_route.method+'.js', function() {
                                                        fs.writeFile(target_dir+'/routes/'+answers['local-name']+'-'+_route.method+'.js', ''+
                                                                'const httpProxy = require("http-proxy");\n'+
                                                                'const proxy = httpProxy.createProxyServer({});\n\n'+
                                                                'module.exports = function(app, config, middlewares) {\n\n'+
                                                                    '\tapp.'+_route.method+'("/'+answers['local-name']+'", function(req, res) {\n\n'+

                                                                        patch_request+
                                                                            '\t\tproxy.web(req, res, { target: '+target+' }, \n'+
                                                                                    '\t\tfunction(err) { if(err) throw err; });\n\n'+

                                                                            '\t});\n\n'+
                                                                        '}\n'+
                                                                        '', function(err) {
                                                                            if(err) {
                                                                                return console.log(err);
                                                                            }

                                                                            back_to_main("The file was saved!");

                                                                        }); 

                                                    });
                                                });
                                                break;

                                            default:
                                                break;
                                        }
                                    });

                                });
                            });

                        });

                    });

                    break;

                case 'Reset cache':
                    reset_cache(function() {
                            main();
                    },true);
                    break;


                case 'Quit':
                    console.log('bye');
                    process.exit(1);
                    return;

                default:
                    break;
            }
        });

    });

}

//Main Process
readArguments(function(args) {
    if(!args) {
        define.folder.target(function() {
            run_folder = target_dir+'/system';
            run_file = run_folder+'/run.json';

            if (!fs.existsSync(run_folder)) {
                mkdirp(run_folder, function(err) { 
                    if (err) throw err;
                });
            }
            if (fs.existsSync(run_file)) {
                run = require(run_file);
            }

            cache_folder = run_folder+'/.cache';
            define.file.config(define.data.config);

            clean.config();

            if (!config.type || config.type === 'cluster') { 

                isCluster = true;
                isServer = false;

                //target_dir = '.';//TODO Obsolete?
                if(config.name) cluster_name = config.name;
                while (!cluster_name){
                    cluster_name = promptSync('?'.green+' New Cluster detected. Name it:* '.bold.white);
                    if(config && cluster_name) config.name = cluster_name;
                }

                config.name = cluster_name;
                config.type = 'cluster';

            } else {

                isCluster = false;
                isServer = true;

                if (config.type === 'picoservice') { 
                    isPicoService = true;
                } else if (config.type === 'application') { 
                    isApplication = true;
                } else { 
                    throw('Type "'.yellow+config.type.yellow+'" is not supported.'.yellow,'Abort'.red);
                } 

            }

            write.file.config(function() {
                //read.file.config(function(cf) {
                    ensure_cache(function() {
                        loadMenu();
                        main();
                    },false);
                //});
            });


        });
    }
});
