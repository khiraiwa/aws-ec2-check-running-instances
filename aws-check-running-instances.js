var Log4js = require('log4js');
Log4js.configure('log-config.json');
var systemLogger = Log4js.getLogger('system');

var AWS = require('aws-sdk');
var Promise = require('bluebird');
var request = require('request');

var AWS_REGIONS = [
    'us-west-1',
    'us-west-2',
    'us-east-1'
];

var INSTANCE_TYPE_PRICES = {
    "us-west-1" : {
	"m1.small": 0.047,
	"m1.medium": 0.095,
	"m1.large": 0.19,

	"t2.micro": 0.017,
	"t2.small": 0.034,

	"m3.medium": 0.077
    },
    "us-west-2" : {
	"m1.small": 0.044,
	"m1.medium": 0.087,
	"m1.large": 0.175,

	"t2.micro": 0.013,
	"t2.small": 0.026,

	"m3.medium": 0.067
    },
    "us-east-1" : {
	"m1.small": 0.044,
	"m1.medium": 0.087,
	"m1.large": 0.175,

	"t2.micro": 0.013,
	"t2.small": 0.026,

	"m3.medium": 0.067
    }
};

var arrayMerge = function() {
    if (arguments.length === 0) {
	return false;
    }

    var i, len, key, result = [];
 
    for (i = 0, len = arguments.length;i < len; i++) {
        if (typeof arguments[i] !== 'object') {
	    continue;
	}
        for (key in arguments[i]) {
            if (isFinite(key)) {
                result.push(arguments[i][key]);
            } else {
                result[key] = arguments[i][key];
            }
        }
    }
    return result;
};

var describeInstances = function(resolve, reject, ec2, params) {
    ec2.describeInstances(params, function(err, data){
	if (err) {
	    reject();
	}
	var nextToken = data.NextToken;
	if (nextToken !== undefined && nextToken !== null) {
	    params.NextToken = nextToken;
	    describeInstances(resolve, reject, ec2, params);
	}
	return resolve(data);
    });
};

var promisedDescribeInstances = function(ec2) {
    var params = {
	Filters: [
	    {
		Name: 'instance-state-name',
		Values: [
		    "running"
		]
	    }
	]
    };
    return new Promise(function(resolve, reject){
	describeInstances(resolve, reject, ec2, params);
    });
};

exports.handler = function(event, context) {
    Promise.all(AWS_REGIONS.map(function(region) {
	systemLogger.info('次のリージョンのrunningインスタンス取得開始: ', region);
	var ec2 = new AWS.EC2({region: region, maxRetries: 15});
	return promisedDescribeInstances(ec2, null);
    })).then(function(data) {
	var reservations = {};
	for (i_d in data) {
	    reservations = arrayMerge(reservations, data[i_d].Reservations);
	}
	return Promise.all(reservations.map(function(reservation) {
	    systemLogger.info('タグのフィルタ開始: ');
	    var typeIsNotExist = true;
	    var typeIsNG = false;
	    for (i_t in reservation.Instances[0].Tags) {
		if (reservation.Instances[0].Tags[i_t].Key == 'Type') {
		    typeIsNotExist = false;
		    if (reservation.Instances[0].Tags[i_t].Value == 'dev') {
			typeIsNG = true;
			break;
		    }
		}
	    }

	    if (typeIsNotExist) {
		typeIsNG = true;
	    }
	    if (typeIsNG) {
		return Promise.resolve(reservation.Instances[0]);
	    }
	    return Promise.resolve();
	}));    
    }).then(function(data){
	systemLogger.info('終了すべきインスタンスリストを取得。');
	var slack_messages = '';
	for (i_d in data) {
	    if (data[i_d] !== undefined && data[i_d] !== null) {
		slack_messages += '-----------------------------\n';
		for (i_t in data[i_d].Tags) {
		    if (data[i_d].Tags[i_t].Key == 'Name') {
			slack_messages += 'Name: ' + data[i_d].Tags[i_t].Value + '\n';
		    }
		    if (data[i_d].Tags[i_t].Key == 'createUserArn') {
			slack_messages += 'CreatedUser: ' + data[i_d].Tags[i_t].Value + '\n';
		    }
		}

		var instanceId = data[i_d].InstanceId;
		var instanceType = data[i_d].InstanceType;
		var availabilityZone = data[i_d].Placement.AvailabilityZone;
		var launchTime = data[i_d].LaunchTime;
		slack_messages += 'InstanceId: ' + instanceId + '\n';
		slack_messages += 'InstanceType: ' + instanceType + '\n';

		var date_today = new Date();
		var date_launchTime = new Date(launchTime);
		var hours = (date_today - date_launchTime) / 1000.0 / 3600.0 ;

		var region = availabilityZone.substr(0, availabilityZone.length-1);
		slack_messages += 'Region: ' + region + '\n';

		var cost = hours * INSTANCE_TYPE_PRICES[region][instanceType];
		slack_messages += 'Cost:\n';
		slack_messages += '      ' + '$ ' + Math.round(cost) + '\n';
		slack_messages += '      ' + Math.round(cost * 120) + ' 円' + '\n';
		slack_messages += '-----------------------------\n';
	    }
	}
	return Promise.resolve(slack_messages);
    }).then(function(messages) {
	systemLogger.info('Slackに送信します。');
	if (messages.length > 0) {
	    messages = '$1 = 120円換算です。\n' + messages;
	    messages = '起動しているインスタンスでTypeタグがdev, もしくは存在しないものをリストアップしています。\n' + messages;
	}
	systemLogger.info(messages);
	var options = {
            url: 'https://hooks.slack.com/services/xxxxxxx',
            form: 'payload={"text": "' + messages + '", "link_names": "1"}',
            json :true
	};
	return new Promise(function(resolve, reject){
	    request.post(options, function(err, response, body){
		if (err) {
		    reject(err);
		}
		resolve();
	    });
	});
    }).then(function(messages) {
	systemLogger.info('正常終了しました。');
	context.succeed();
    }).catch(function(err){
	systemLogger.error('エラー終了しました。');
	systemLogger.error(err, err.stack);
	context.fail();
    });;
};

// ローカル実行用
if (!module.parent) {
    var hoge = (function() {
        var hoge = function() {};
        var p = hoge.prototype;
        p.succeed = function() {};
        p.done = function() {};
        return hoge;
    })();
    var mockedContext = new hoge();
    exports.handler(null, mockedContext);
}
