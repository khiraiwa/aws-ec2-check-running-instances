# aws-get-ec2-instances-list

## ローカルで試す

### 前準備
* AWSのCredentialsの設定ずみとする。
* 下記のコマンドで必要なモジュールをインストールする。(package.jsonのあるディレクトリで実行)  
`$ npm install`

### 実行

```bash
$ node aws-check-running-instances.js
```

## AWS Lambdaにインストール
### ポリシーの作成

名前は任意。例えばLambdaDescribeEC2Instancesのように設定する。  
中身は下記のように設定する。

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ec2:DescribeInstances"
            ],
            "Resource": [
                "*"
            ]
        }
    ]
}
```

## ロールの作成
続いてロールを作成する。

こちらも名前は任意。例えばLambdaDescribeEC2InstancesRoleのように設定する。
RoleTypeはAWS Lambdaを選択する。  
中身は先ほど作成したロールをアタッチする。例だとLambdaDescribeEC2Instances。

## Lamda Functionの作成

下記のコマンドを実行する。

```bash
$ npm install
$ zip aws-check-running-instances.zip -r aws-check-running-instances.js log-config.json node_modules
$ aws --region [作成するリージョン名] lambda create-function --function-name EC2CheckRunningInstances --zip-file fileb://[Zipファイルへのパス]/aws-check-running-instances.zip --role [上記で作成したロールのRole ARN] --handler aws-check-running-instances.handler --runtime nodejs --timeout 60 --memory-size 128
```
