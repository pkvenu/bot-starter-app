require('dotenv').config();

var express = require('express');
var request = require('request');
const RC = require('ringcentral');


const PORT= process.env.PORT;
const REDIRECT_HOST= process.env.REDIRECT_HOST;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const RINGCENTRAL_ENV= process.env.RINGCENTRAL_ENV;


var app = express();
var platform, subscription, rcsdk, subscriptionId, bot_token;
var creatorID;


// Lets start our server
app.listen(PORT, function () {
    //Callback triggered when server is successfully listening. Hurray!
    console.log("Example app listening on port " + PORT);
});


// This route handles GET requests to our root ngrok address and responds with the same "Ngrok is working message" we used before
app.get('/', function(req, res) {
    res.send('Ngrok is working! Path Hit: ' + req.url);
});


rcsdk = new RC({
    server: RINGCENTRAL_ENV,
    appKey: CLIENT_ID,
    appSecret: CLIENT_SECRET
});

platform = rcsdk.platform();

//Authorization callback method.
app.get('/oauth', function (req, res) {
    if(!req.query.code){
        res.status(500);
        res.send({"Error": "Looks like we're not getting code."});
        console.log("Looks like we're not getting code.");
    }else {
        //console.log("Creator Extension ID: " + req.query.creator_extension_id);
        creatorID = req.query.creator_extension_id;
        platform.login({
            code : req.query.code,
            redirectUri : REDIRECT_HOST + '/oauth'
        }).then(function(authResponse){
            var obj = authResponse.json();
            bot_token = obj.access_token;
            res.send(obj)
            console.log("Bot Token :" + bot_token);
            getBotIdentity();
            setTimeout(function() {
                subscribeToGlipEvents();
            }, 10000);
        }).catch(function(e){
            console.error(e)
            res.send("Error: " + e);
        })
    }
});

// Callback method received after subscribing to webhook
app.post('/callback', function (req, res) {
    var validationToken = req.get('Validation-Token');
    var body =[];

    if(validationToken) {
        console.log('Responding to RingCentral as last leg to create new Webhook');
        res.setHeader('Validation-Token', validationToken);
        res.statusCode = 200;
        res.end();
    } else {
        req.on('data', function(chunk) {
            body.push(chunk);
        }).on('end', function() {
            body = Buffer.concat(body).toString();
            console.log('WEBHOOK EVENT BODY: ', body);
            var obj = JSON.parse(body);
            res.statusCode = 200;
            res.end(body);
        });
    }
});

// Method to Get Bot Information.
function getBotIdentity(){
    platform.get('/account/~/extension/~')
        .then(function(extensionInfo){
            var identity = JSON.parse(extensionInfo.text());
            //console.log("Bot Identity :" + JSON.stringify(identity));
            setTimeout(function() {
                IsBotAddedToGlip(identity.id);
            }, 5000);
        }).catch(function(e){
            console.error(e);
            throw e;
        })
}

// Method to Check if the bot is added to Glip
// TODO: Need to find a better way to achive this task
function IsBotAddedToGlip(botId){
    platform.get('/glip/persons/'+botId)
        .then(function(botInfo){
               console.log("Bot is Added to Glip");
               createGroup(botId,creatorID); 
        }).catch(function(e){
            console.log("Waiting for bot to be added to Glip...!");
            setTimeout(function() {
                IsBotAddedToGlip(botId);
            }, 10000);
        })
}

// Method to Create Group
function createGroup(botId, creatorId){
   console.log("In Create Group"); 
   platform.post('/glip/groups',{
        type: "PrivateChat",
        members: [
            botId,
            creatorId
        ]
   }).then(function(groupInfo){
        console.log("Group Created");
        var groupObj = groupInfo.json();
        console.log("GroupID: "+ groupObj.id);
        sendWelcomeMessage(groupObj.id); 
    }).catch(function(e){
        console.log(e);
        throw e;
    })

}

// Method to send welcome message
function sendWelcomeMessage(groupId){
    console.log("In Send Welcome Message");
    var welcomeMessage = "Hi ![:Person]("+ creatorID +"), This is a test bot to complete the bot provisioning flow.";
    platform.post('/glip/posts',{
        groupId: groupId,
        text: welcomeMessage
    }).then(function(response){
        console.log("Post Successful");
    }).catch(function(err){
        console.log(err);
    });
 }

// Method to Subscribe to Glip Events.
function subscribeToGlipEvents(){

    var requestData = {
        "eventFilters": [
            "/restapi/v1.0/glip/posts",
            "/restapi/v1.0/glip/groups"
        ],
        "deliveryMode": {
            "transportType": "WebHook",
            "address": REDIRECT_HOST + "/callback"
        },
        "expiresIn": 630720000
    };
    platform.post('/subscription', requestData)
        .then(function (subscriptionResponse) {
            console.log('Subscription Response: ', subscriptionResponse.json());
            subscription = subscriptionResponse;
            subscriptionId = subscriptionResponse.id;
        }).catch(function (e) {
            console.error(e);
            throw e;
    });
}

