//v0.2
//TODO add md5 verification to cache management in order to redownload files if anomalies exist
//TODO autosave a copy of config.json files before writing them and restore things if anomalies exist (preserve atomicity)
//TODO find a way to handle any internet interuption during node creation (that involve some downloads, i.e npm and bower install)
//TODO Convert every exec by detached spawn


//Constant declaration
const inquirer = require('inquirer');
const jsonfile = require('jsonfile')
const mkdirp = require('mkdirp');
const fs = require('fs');
const fse = require('fs-extra');
const fsee = require('extfs');
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
const art = require("ascii-art");
const ProgressBar = require('progress');
const isOnline = require('is-online');
const isDirectory = require('is-directory');
const stripcolorcodes = require('stripcolorcodes');
const clone = require('gitclone');

const github = {
    "url": "https://github.com/agencetca",
    repo : {
        "cluster-repo": "inode-cluster",
        "server-repo": "inode-server",
    }

}

var editor = 'vim';
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
var pwd = '';
var history = [];
var selected = '';
var select = {
    single : {
        menu : {
            type: 'list',
            message: 'Menu',
            choices: function(sel) {
                var enable = '';
                if(config.servers[sel]) {
                    enable = 'disable inode';
                } else {
                    enable = 'enable inode';
                }

                return [
                    enable,
                    'delete inode',
                    'manage configuration',
                    'manage interface',
                    'manage services'
                ];
            }
        },
        'manage configuration' : {
            type: 'list',
            message: 'Config',
            choices: [
                'view config',
                'edit config'
            ]
        },
        'manage interface' : function(name) {
            var uri = target_dir+'/servers/'+name+'/config.json';
            delete require.cache[uri];
            var _config = require(uri);

            function buildList() {

                var list = [];

                if(_config['static-entry-point'] && !fs.existsSync(target_dir+'/servers/'+name+'/static/'+_config['static-entry-point'])) {
                    delete _config['static-entry-point'];
                }

                if (!fs.existsSync(target_dir+'/servers/'+name+'/static')) {

                    list.push('create interface from scratch');
                    list.push('create interface from Github repository');

                } else {

                    list.push('delete interface');

                    if(_config['static-content-enabled'] === 'true') {
                        list.push('disable interface');
                    } else {
                        if(_config['static-entry-point']) {
                            list.push('enable interface');
                        }
                    }

                    var empty = fsee.isEmptySync(target_dir+'/servers/'+name+'/static');
                    if(empty === false) {

                        if(!_config['static-entry-point'] && fs.existsSync(target_dir+'/servers/'+name+'/static/index.html')) {
                            _config['static-entry-point'] = 'index.html';
                            write.file.uri(uri, _config, function() {
                            });
                        }

                        if(_config['static-entry-point']) {
                            list.push('preview interface');
                            list.push('change entry-point');

                            if(!(_config['static-entry-point'] === 'index.html' && fs.existsSync(target_dir+'/servers/'+name+'/static/index.html'))) {
                                list.push('remove entry-point');
                            }
                        } else {
                            list.push('define entry-point');
                        }
                    }

                    list.push('explore interface');

                    //list.push('plug service to interface');
                    //list.push('unplug service from interface');
                }

                return list;
            }

            return {
                type: 'list',
                message: 'Interface',
                choices: buildList
            }


        },

        'manage services' : {
            type: 'list',
            message: 'Services',
            choices: [
                'list services',
                'view service',
                'add service',
                'edit service',
                'remove service'
            ]
        }

    }
};

var methods = {
    thirdpart : {
        add : function() {

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

                                            console.log('Execute '+editor+' '+target_dir+'/servers/third-part-servers/'+resp.name+'.js'); 

                                        });
                        })

                    });

        }
    },
    inode : {
        add : function() {

                    var _config = {};

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
                                    while (!resp['static-app-url'] && resp['static-app-url'] !== ''){
                                        resp['static-app-url'] = promptSync('?'.green+' Github repository: '.bold.white);
                                    }

                                    var head = new RegExp('^(https?:\/\/)?github.com\/');
                                    var tail = new RegExp('\.git$');
                                    resp['static-app-url'] = resp['static-app-url'].replace(head,'').replace(tail,'');

                                }

                                finalize_process = function() {

                                    write.file.config(function() {

                                        var objs = [];
                                        for(var serv in config.servers) {
                                            if(serv === resp.name) {
                                                _config['port-range'] = current_range;
                                                jsonfile.writeFile(target_dir+'/servers/'+resp.name+'/config.json', _config, {spaces: 2}, function(err) {
                                                    if(err) console.error(err);

                                                    var asterisk = '*';//'coz vim sucks while editing this code
                                                    mkdirp(target_dir+'/servers/'+resp.name+'/system', function(err) { 
                                                        if (err) throw err;
                                                    });

                                                    mkdirp(target_dir+'/servers/'+resp.name+'/system/admin', function(err) { 
                                                        if (err) throw err;
                                                    });

                                                    exec('cp -rf '+cache_folder+'/'+github.repo["cluster-repo"]+'/'+asterisk+' '+target_dir+'/servers/'+resp.name+'/system/admin', function (error, stdout, stderr) {
                                                        if(err) console.error(err);
                                                        console.log(colors.green('Inode '+resp.name+' has been installed!'));
                                                        if(resp.static === 'true') {
                                                            emptyDir(target_dir+'/servers/'+resp.name+'/static', 
                                                                    function(err, result) {
                                                                        if (err) {
                                                                            console.error(err);
                                                                        }

                                                                        if(result){
                                                                            console.log(colors.yellow('Interface '+
                                                                                        'is activated, but empty. '+
                                                                                        'Place client-side files into : "static".'));
                                                                        }

                                                                        main();

                                                                    });

                                                        } else {
                                                            main();
                                                        }
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

                                    var asterisk = '*';//'coz vim sucks while editing this code
                                    exec('mkdir '+target_dir+'/servers/'+resp.name+' && cp -rf '+cache_folder+'/'+github.repo["server-repo"]+'/'+asterisk+' '+target_dir+'/servers/'+resp.name,(error, stdout, stderr) => {
                                        if(error) console.log(error);

                                        _config.name = resp.name;
                                        _config.type = 'server';
                                        _config.owner = resp.owner;
                                        _config.description = resp.description;
                                        _config.licence = resp.licence || 'none';
                                        _config.port = resp.host.split(':')[1];
                                        _config['static-content-enabled'] = resp.static;

                                        if(_config['static-content-enabled'] === 'true') {

                                            _config['static-entry-point'] = 'index.html';

                                            mkdirp(target_dir+'/servers/'+resp.name+'/static', function(err) { 
                                                if (err) throw err;
                                            });
                                        } 

                                        if(resp['static-app-url']) {

                                            isOnline(function(err, online) {

                                                _config['static-origin'] = resp['static-app-url'];
                                                var static_abs_path = path.join(target_dir+'/servers/'+resp.name+'/static');

                                                if (online) {
                                                    console.log('Cloning... ');
                                                    clone(_config["static-origin"], { dest: static_abs_path }, [], (err) => {

                                                        if (err) {
                                                            console.log('Cloning... error.'.red);
                                                            //console.error(err)
                                                            finalize_process();
                                                        } else {
                                                            console.log('Cloning... done.');
                                                            var fflag=0;
                                                            var finder = require('findit')(static_abs_path);
                                                            finder.on('file', function (file) {
                                                                if(path.basename(file) === _config['static-entry-point'] && fflag === 0) {
                                                                    fflag=1;
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
                                                        }
                                                    });
                                                } else {
                                                    console.log(colors.red('\nInternet connexion is not active, neither npm nor bower installation will be performed.\nWhen internet connexion will be ready, please execute : cd '+static_abs_path+' && npm install && bower install'));
                                                    finalize_process();
                                                }

                                            });
                                        } else {
                                            finalize_process();
                                        }

                                    });
                                });
                            });
                        }); 
                        //});

        },
        configure : function() {

                    if(!config.servers || (!detect.servers.exist() && !detect.servers.disabled())) {
                        console.log('No servers available'.red);
                        main();
                        return;
                    }

                    ask({
                        type: 'list',
                        message: 'Select an inode',
                        before : function() {
                            selected = '';
                        },
                        choices: function() {
                            if(!config.servers) config.servers = {};
                            if(!config.disabled) config.disabled = {};

                            var active = Object.keys(config.servers);
                            var inactive = Object.keys(config.disabled);

                            for (let i in inactive) {
                                inactive[i] = colors.gray(inactive[i]);
                            }

                            return active.concat(inactive)
                        }
                    });
        }
    },
    'enable inode' : function (item) {
        if(!config.disabled) config.disabled = {};
        if(!config.servers) config.servers = {};
        config.servers[item] = config.disabled[item];
        delete config.disabled[item];
        write.file.config(function() {
            methods.message('Inode '+item+' has been enabled!', function() {
                methods.back();
            });
        });
    },
    'disable inode' : function (item) {
        if(!config.disabled) config.disabled = {};
        if(!config.servers) config.servers = {};
        config.disabled[item] = config.servers[item];
        delete config.servers[item];
        write.file.config(function() {
            methods.message('Inode '+item+' has been disabled!', function() {
                methods.back();
            });
        });
    },
    'delete inode' : function (item) {
        var confirmed = null;
        while (confirmed !== 'true' && confirmed !== 'false') {
            confirmed = promptSync('?'.green+' Confirm "'+item+'" deletion [true|false]: '.white);
        }

        if(confirmed === 'true') {
            delete config.servers[item];
            delete config.disabled[item];
            fse.remove(target_dir+'/servers/'+item, function (err) {
                if(err) throw(err);
                write.file.config(function() {
                    methods.message('Inode '+item+' has been deleted successfully!', function() {
                        history.shift();
                        methods.back();
                    });
                });
            });
        } else {
            methods.back();
        }
    },
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
    'browser' : function(uri, cbk) {
        var browser = spawn('firefox', [uri], {detached: true, stdio: 'ignore'})
            cbk();
    },
    'read' : function(uri, cbk) {
        fs.readFile(uri, 'utf8', function (err,data) {
            if (err) {
                return console.log(err);
            }
            cbk(data);
        });
    },
    'edit' : function(uri, cbk) {
        var edit = spawn(editor, [uri], {stdio: 'inherit'})
            edit.on('exit', function() {
                cbk();
            });
    },
    'explore' : function(uri, msg, choices, cbk) {

        pwd = uri;//important


        if(typeof cbk !== 'function' && typeof msg === 'function' && typeof choices !== 'function')  {
            cbk = msg;
            msg = false;
            choices = false;
        } else if(typeof cbk !== 'function' && typeof choices === 'function')  {
            cbk = choices;
            choices = false;
        }

        //TODO isArray
        if(typeof choices !== 'object')  {
            choices = ['view file','edit file','delete file'];
        }

        if(typeof cbk !== 'function')  {
            cbk = function() {
                methods.back();
            }
        }

        if(!msg)  {
            var pattern = new RegExp('.*static/?');
            var furi = uri.replace(pattern,'/');
            msg = 'Explore '+furi.green;
        }

        methods['list-files-in-dir'](uri, function(files) {

            function resolve() {
                ask({
                    type: 'list',
                    message: msg,
                    choices: files.sort().concat([
                            'Add a new file'.italic.white,
                            'Add a new folder'.italic.white
                    ]),
                    callback : function(file) {

                        if(!msg) { 
                            msg += colors.green('/'+file);
                        }

                        isDirectory(uri+'/'+file, function(err, dir) {
                            if (err) throw err;
                            if(dir === true) {
                                methods.explore(uri+'/'+file, cbk);
                            } else {

                                ask({
                                    type: 'list',
                                    message: 'File '+file,
                                    choices: choices,
                                    callback : function(choice) {
                                        if(choice === 'view file') {
                                            console.log(colors.yellow('\nFile : '+file));
                                            methods.read(uri+'/'+file, function(data) {
                                                methods.message(data, function() {
                                                    methods.back();
                                                });
                                            });
                                        } else if(choice === 'edit file') {
                                            methods.edit(uri+'/'+file, function() {
                                                methods.back();
                                            });
                                        } else if(choice === 'delete file') {
                                            fs.unlinkSync(uri+'/'+file);
                                            history.shift();
                                            history.shift();
                                            methods.explore(uri);
                                        } else {
                                            cbk(choice,uri+'/'+file);
                                        }
                                    }
                                });
                            }
                        });
                    }
                });
            }

            if (!files) {
                methods.back();
            } else if(files && !files.length) {
                msg += ' (Empty folder)'.red;
                resolve();
            } else if(files && files.length) {

                for(let i=0; i<files.length; i++) {
                    isDirectory(uri+'/'+files[i], function(err, dir) {
                        if (err) throw err;
                        if(dir === true) {
                            files[i] = files[i].bold.green;
                        } else {
                            files[i] = files[i].yellow;
                        }
                        if(i === files.length-1) {
                            resolve();
                        }

                    });
                }

            }

        });
    },
        'Add a new file' : function(name,cbk) {
            var uri = pwd;
            var filename = promptSync('?'.green+' Name of the new file: '.white);
            if(!fs.existsSync(uri+'/'+filename)) {
                methods.edit(uri+'/'+filename, function() {
                    history.shift();
                    methods.explore(uri);
                });
            } else {
                console.log(colors.red('Already exist'));
                methods.back();
            }

        },
        'Add a new folder' : function(name,cbk) {
            var uri = pwd;
            var folder = promptSync('?'.green+' Name of the new file: '.white);
            if(!fs.existsSync(uri+'/'+folder)) {

                mkdirp(uri+'/'+folder, function(err) { 
                    if (err) throw err;
                    history.shift();
                    methods.explore(uri);
                });
            } else {
                console.log(colors.red('Already exist'));
                methods.back();
            }

        },
            'list-files-in-dir' : function(dir,cbk) {
                fs.readdir(dir, (err, files) => {
                    cbk(files);
                })
            },
            'view config' : function(name) {
                delete require.cache[target_dir+'/servers/'+name+'/config.json'];
                var config = require(target_dir+'/servers/'+name+'/config.json');
                methods.message(config, function() {
                    methods.back();
                });
            },
                'edit config' : function(name) {
                    var uri = target_dir+'/servers/'+name+'/config.json';
                    var config = require(uri);
                    methods.edit(uri, function() {
                        write.file.config(function() {
                            methods.back();
                        });
                    });
                },
                'remove entry-point' : function(name,cbk) {
                    var uri = target_dir+'/servers/'+name;
                    delete require.cache[uri+'/config.json'];
                    var _config = require(uri+'/config.json');
                    if(_config['static-entry-point'] === 'index.html' && fs.existsSync(uri+'/static/index.html')) {
                            methods.message(colors.yellow('Entry point "index.html" can NOT be removed since the file exists in static (default behavior)'), function() {
                                if(cbk) {
                                    cbk();
                                } else {
                                    methods.back();
                                }
                            });
                    } else {
                        delete _config['static-entry-point'];
                        write.file.uri(uri+'/config.json', _config, function() {
                            methods.message(colors.yellow('Entry point has been removed'), function() {
                                if(cbk) {
                                    cbk();
                                } else {
                                    methods.back();
                                }
                            });
                        });
                    }
                },
                'change entry-point': function(name,cbk) {
                    methods['define entry-point'](name,cbk);
                },
                'define entry-point' : function(name,cbk) {

                    var uri = target_dir+'/servers/'+name;
                    delete require.cache[uri+'/config.json'];
                    var _config = require(uri+'/config.json');

                    function handle(files,p) {
                    ask({
                            type: 'list',
                            message: 'Choose an entry-point for the interface',
                            choices: files.sort(),
                            callback : function(file) {
                                isDirectory(p+'/'+file, function(err, dir) {
                                    if (err) throw err;
                                    if(dir === true) {
                                        list_dir(p+'/'+file);
                                    } else {
                                        var furi = p+'/'+file;
                                        var pattern = new RegExp('.*static/');
                                        if(_config['static-entry-point'] === furi.replace(pattern,'')) {
                                                methods.message(colors.yellow('This entry point is already enabled'), function() {
                                                    methods.back();
                                                });
                                        } else {
                                            _config['static-entry-point'] = furi.replace(pattern,'');
                                            write.file.uri(target_dir+'/servers/'+name+'/config.json', _config, function() {
                                                methods.message(colors.yellow('Entry point enabled\nThe current entry-point is '+_config['static-entry-point']), function() {

                                                    history.shift();
                                                    list_dir (p);

                                                });
                                            });
                                        }
                                    }
                                });

                            }
                        });
                    }

                    function list_dir (p){

                        methods['list-files-in-dir'](p, function(files) {

                            if (!files.length) {

                                            handle(files,p);

                            } else {
                                for(let i=0; i<files.length; i++) {
                                    isDirectory(p+'/'+files[i], function(err, dir) {
                                        if(dir) {
                                            files[i] = files[i].green;
                                        } else {
                                            if(files[i] === _config['static-entry-point']) {
                                                files[i] = files[i].bold.yellow;
                                            } else {
                                                files[i] = files[i].yellow;
                                            }
                                        }


                                        if(i+1 === files.length) {

                                            handle(files,p);

                                        }
                                    });


                                }
                            }


                        });
                    }

                    list_dir(uri+'/static');
                },
                    'create interface from Github repository' : function(name) {
                            methods.message('TODO\nThe idea is to ask for a github repo and download the repo into the interface folder', function() {
                                methods.back();
                            });
                    },
                    'create interface from scratch' : function(name) {
                        var uri = target_dir+'/servers/'+name;
                        delete require.cache[uri+'/config.json'];
                        var _config = require(uri+'/config.json');
                        if (!fs.existsSync(uri+'/static')) {
                            mkdirp(uri+'/static', function(err) { 
                                if (err) throw err;
                            });
                            if(_config['static-entry-point']) delete _config['static-entry-point'];
                            if(_config['static-origin']) delete _config['static-origin'];
                        }
                        _config['static-content-enabled'] = 'false';
                        write.file.uri(uri+'/config.json',_config,function() {
                            methods.message('Interface added', function() {
                                methods.back();
                            });
                        });
                    },
                    'delete interface' : function(name) {
                        var uri = target_dir+'/servers/'+name;
                        delete require.cache[uri+'/config.json'];
                        var _config = require(uri+'/config.json');
                        _config['static-content-enabled'] = 'false';
                        if(_config['static-entry-point']) delete _config['static-entry-point'];
                        if(_config['static-origin']) delete _config['static-origin'];
                        if (fs.existsSync(uri+'/static')) {
                            execSync('rm -rf '+uri+'/static', (err, stdout, stderr) => {
                                if(err) throw(err);
                            });
                        }
                        methods.message('Interface deleted', function() {
                            methods.back();
                        });
                    },
                    'preview interface' : function(name) {

                        var uri = target_dir+'/servers/'+name;
                        delete require.cache[uri+'/config.json'];
                        var config = require(uri+'/config.json');
                        var interface_folder = uri+'/static';
                        var interface_index = interface_folder+'/'+config['static-entry-point'];

                        if(!fs.existsSync(interface_index)) {
                            methods.back();
                        } else {
                            methods.browser(interface_index, function() {
                                methods.message('Interface is currently shown in browser window', function() {
                                    methods.back();
                                });
                            });
                        }

                    },
                    'explore interface' : function(name) {
                        var uri = target_dir+'/servers/'+name;
                        delete require.cache[uri+'/config.json'];
                        var config = require(uri+'/config.json');
                        var interface_folder = uri+'/static';
                        var interface_index = interface_folder+'/'+config['static-entry-point'];

                        methods.explore(interface_folder);
                        return;

                        if (fs.existsSync(interface_folder)) {

                            methods.explore(interface_folder);

                        } else {
                            methods.message(colors.red('Error occured : '+interface_folder+' doesn\'t exist.\n'+
                                        'Abort.'), function() {
                                methods.back();
                            });
                        }
                    },
                        'enable interface' : function(name) {
                            var uri = target_dir+'/servers/'+name+'/config.json';
                            delete require.cache[uri];
                            var config = require(uri);
                            config['static-content-enabled'] = 'true';
                            write.file.uri(uri, config, function() {
                                methods.message('Interface '+name+' enabled', function() {
                                    methods.back();
                                });
                            });
                        },
                        'disable interface' : function(name) {
                            var uri = target_dir+'/servers/'+name+'/config.json';
                            delete require.cache[uri];
                            var config = require(uri);
                            config['static-content-enabled'] = 'false';
                            write.file.uri(uri, config, function() {
                                methods.message('Interface '+name+' disabled', function() {
                                    methods.back();
                                });
                            });
                        },
                            'list services' : function(name) {
                                methods.message('list', function() {
                                    methods.back();
                                });
                            },
                            'view service' : function(name) {
                                methods.message('view', function() {
                                    methods.back();
                                });
                            },
                            'add service' : function(name) {

                                pwd = target_dir+'/servers/'+name;

                                var service = [
                                {
                                    type: 'input',
                                    name: 'name',
                                    message: 'Service name?*',
                                    validate: function(str){
                                        return !!str;
                                    }
                                },
                                {
                                    type: 'input',
                                    name: 'description',
                                    message: 'Description? (none)',
                                    default : 'none',
                                    validate: function(str){
                                        return !!str;
                                    }
                                },
                                    {
                                        type: 'input',
                                        name: 'developper',
                                        message: 'Developper? (anon)',
                                        default : 'anon',
                                        validate: function(str){
                                            return !!str;
                                        }
                                    },
                                    {
                                        type: 'input',
                                        name: 'licence',
                                        message: 'Licence? (none)',
                                        default: 'none',
                                                 validate: function(str){
                                                     return !!str;
                                                 }
                                    }
                                ];

                                inquirer.prompt(service).then(function(resp) {
                                    //HERE
                                    console.log(resp);
                                });
                            },
                            'edit service' : function(name) {
                                methods.message('edit', function() {
                                    methods.back();
                                });
                            },
                                'remove service' : function(name) {
                                methods.message('remove', function() {
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
}


function ask(question) {

    var question_generator = null;
    if(typeof question === 'function') {
        question_generator = question;
        question = question(selected);
    }

    var choice_generator = false;
    if(question.choices && typeof question.choices === 'function') {
        choice_generator = question.choices;
        question.choices = question.choices(selected);
    }

    if(question.before) {
        question.before();
    }

    var back = "back";
    question.name = 'q';

    if(question.choices && question.choices.push) {
        question.choices.push(
                back
                );
    }

    var que = question.message;
    if(selected) {
        question.message = 'Inode : "'+selected+'" - '+que;
    }

    inquirer.prompt(question).then(function (answers) {

        question.message = que;
        if(choice_generator) {
            question.choices = choice_generator;
        } else {
            question.choices.pop();
        }
        if(answers['q'] === back) {
            methods['back']();
            return;
        } else {

            if(question_generator !== null) {
                history.unshift(question_generator);
            } else {
                history.unshift(question);
            }

        }

        answers['q'] = stripcolorcodes(answers['q']);

        if(select.single && select.single[answers['q']]) {
            ask(select.single[answers['q']]);
        } else if(config && config.servers && (config.servers[answers['q']] || detect.servers.disabled([answers['q']]))) {
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
                target_dir = __dirname+'/../..';
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
        },
        uri : function(uri, config, cbk, args) {
            jsonfile.writeFile(uri, config, {spaces: 2}, function(err) {
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
        },
        disabled : function(server) {

            if(server) {
                if(config && config.disabled && config.disabled[server]) {
                    return true;
                } else {
                    return false;
                }
            } else {
                if(config && config.disabled && Object.keys(config.disabled).length) {
                    return true;
                } else {
                    return false;
                }
            }
        }
    }
}

var loadMenu = function() {

    choice_menu = [];

    if(isCluster) {

        choice_menu = choice_menu.concat([
            "Add a node"
        ]);

        if (config && detect.servers.exist()) {

            if(!isClusterRunning()) {
                choice_menu = choice_menu.concat([
                    "Start the cluster"
                ]);
            } else {
                choice_menu = choice_menu.concat([
                    "Restart the cluster",
                    "Stop the cluster"
                ]);
            }

        }

        if (config && (detect.servers.exist() || detect.servers.disabled())) {
            choice_menu = choice_menu.concat([
                "Configure a node"
            ]);
        }

    } else if(isServer) {
        choice_menu = choice_menu.concat([
                "Configure a node",
                "Add a local functionality",
                "Expose a local functionality (api)",
                "Expose a remote functionality",
                "Build a third-part-server",
                "Link picoservice"
        ]);
    }
}

//Cache Management
var build_cache = function(cbk,verbose) {

    isOnline(function(err, online) {
        if (online) {

            fse.remove(cache_folder, function (err) {

                if (err) return console.error(err);

                mkdirp(cache_folder, function(err) { 
                    if (err) throw err;
                });


                function launch(bar) {
                    if (bar.complete) {
                        if(verbose) console.log('Cache built'.yellow);
                        if(cbk) cbk();
                    }
                }

                var bar = new ProgressBar(':bar', { total : Object.keys(github.repo).length * 2});
                var silent = '>/dev/null 2>&1';
                execSync('cd '+cache_folder+' && git clone '+github.url+'/'+github.repo["cluster-repo"]+'.git'+silent, (err, stdout, stderr) => {
                    if(err) throw(err);
                });
                bar.tick();
                //var cluster = spawn('npm',['install','--verbose','--prefix',cache_folder+'/'+github.repo["cluster-repo"]], {
                var cluster = spawn('npm',['install','--no-optional','--only=prod','--prefix',cache_folder+'/'+github.repo["cluster-repo"]], {
                    stdio: 'inherit'
                });
                cluster.on('close', (code) => {
                    bar.tick();
                    launch(bar);
                });
                execSync('cd '+cache_folder+' && git clone '+github.url+'/'+github.repo["server-repo"]+'.git'+silent, (err, stdout, stderr) => {
                    if(err) throw(err);
                });
                bar.tick();
                //var server = spawn('npm',['install','--verbose','--prefix',cache_folder+'/'+github.repo["server-repo"]], {
                var server = spawn('npm',['install','--no-optional','--only=prod','--prefix',cache_folder+'/'+github.repo["server-repo"]], {
                    stdio: 'inherit'
                });
                server.on('close', (code) => {
                    bar.tick();
                    launch(bar);
                });

            });

        } else {
            console.log('This application needs a valid internet connection. Abort'.red);
        }

    });
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

    var check = true;
    var repos = Object.keys(github.repo);

    for (let i=0; i<repos.length; i++) {
        if (!fs.existsSync(cache_folder+'/'+github.repo[repos[i]])) { 
            check = false;
        }
    }

    if(check === true) {

        if(cbk) cbk(function(verbose) {
            if(verbose) console.log('Cache is ready'.yellow);
        },verbose);

    } else {

        build_cache(function() {
            if(cbk) cbk(function(verbose) {
                if(verbose) console.log('Cache is ready'.yellow);
            },verbose);
        }, verbose);
    }

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
    var min = parseInt(range[0],10);
    var max = parseInt(range[1],10);
    portscanner.findAPortNotInUse(min, max, host, function(error, port) {
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

var isClusterRunning = function() {
    if(config && run && run[config.name] && run[config.name].length) {
        return true;
    } else {
        return false;
    }
}

var cluster = {
    start : function(cbk) {

        if(config && run && run[config.name] && run[config.name].length) {
            console.log(colors.yellow('The Cluster is already running.'));
            main();
            return;
        }
        else if(config && !detect.servers.exist()) {
            console.log('No servers available'.red);
            main();
            return;
        }

        var timer = 0;
        var failed = 0;

        for(var serv in config.servers) {
            if(fs.existsSync(target_dir+'/servers/'+serv+'/app.js')) {

                timer += 700;

                const proc = spawn('node', [target_dir+'/servers/'+serv+'/app.js',false], {
                    detached: true,
                    stdio: ['ignore',process.stdout,process.stdout]
                });

                proc.on('close', function(code, signal) {
                    if(code === 1) {
                        failed++;
                        methods.message(colors.red('Inode can\'t be started'), function() {
                            });
                    }

                });

                if(!run[config.name]) {
                    run[config.name] = [];
                }

                run[config.name].push(proc.pid);

            } else {
                console.log('Inode seems broken, no app.js found'.yellow,'Abort'.red);
            }

        }

        jsonfile.writeFile(run_file, run, {spaces: 2}, function(err) {
            if(err) throw(err);
            setTimeout(function() {
                console.log('');//important

                if(failed > 0) {
                    cluster.stop(function() {
                        if(cbk) {
                            cbk();
                            return;
                        } else {
                            main();
                        }
                    });
                } else {
                    if(cbk) {
                        cbk();
                        return;
                    } else {
                        main();
                    }
                }

            },timer);
        });

    },
    stop : function(cbk) {

        if(config && run && run[config.name] && !run[config.name].length) {
            console.log(colors.yellow('The Cluster is already stopped.'));
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

        if(detect.servers.exist() || detect.servers.disabled()) {
            console.log(colors.italic.blue("Cluster is running : "+isClusterRunning()));
        }

        inquirer.prompt([{
            type: 'list',
            name: 'options',
            message: 'What do you want to do?',
            choices: choice_menu.concat([
                    new inquirer.Separator(),
                    "Reset cache",
                    "Update cluster",
                    "Quit",
                    new inquirer.Separator()
            ])
        }]).then(function (answers) {
            switch(answers.options) {

                case 'Configure a node':

                    return methods.inode.configure();

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

                    return methods.inode.add();

                    break;

                case 'Build a third-part-server':

                    return methods.thirdpart.add();

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
                                                var child = child_process.spawn(editor, [target_dir+'/middlewares/'+resp.name+'.js'], {
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

                case 'Update cluster':
                    back_to_main('TODO\nThe idea is to replace all app files and clusters files in all inodes by new cache content');
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

            } else if(config.type === 'server') {

                isCluster = false;
                isServer = true;
            }

            write.file.config(function() {
                //read.file.config(function(cf) {
                    ensure_cache(function() {
                        loadMenu();

                        art.font(config.name.toUpperCase(), 'Doom', function(rendered){
                            console.log(colors.yellow('\n\n'+rendered));
                            main();
                        });

                    }, true);
                //});
            });


        });
    }
});
