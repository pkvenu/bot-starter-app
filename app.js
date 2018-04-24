require('dotenv').config();

var express = require('express');
var request = require('request');
const RC = require('ringcentral');
var bodyParser = require('body-parser');


const PORT= process.env.RINGCENTRAL_PORT;
const REDIRECT_HOST= process.env.RINGCENTRAL_REDIRECT_URL;
const CLIENT_ID = process.env.RINGCENTRAL_CLIENT_ID;
const CLIENT_SECRET = process.env.RINGCENTRAL_CLIENT_SECRET;
const RINGCENTRAL_ENV= process.env.RINGCENTRAL_SERVER_URL;


var app = express();
app.use(bodyParser.json());
var platform, subscription, rcsdk, subscriptionId, bot_token;
var creatorID, botID;


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
        console.log("Creator Extension ID: " + req.query.creator_extension_id);
        creatorID = req.query.creator_extension_id;
        platform.login({
            code : req.query.code,
            redirectUri : REDIRECT_HOST + '/oauth'
        }).then(function(authResponse){
            var obj = authResponse.json();
            bot_token = obj.access_token;
            //res.send(obj)
            res.send({});
            console.log("Token obj ;" + JSON.stringify(obj));
            console.log("Bot Token :" + bot_token);
            getBotIdentity();

        }).catch(function(e){
            console.error(e)
            res.send("Error: " + e);
        })
    }
});

// Callback method received after subscribing to webhook
app.post('/glip/receive', function (req, res) {

    var validationToken = req.get('Validation-Token');

    if(validationToken) {
        console.log('Responding to RingCentral as last leg to create new Webhook');
        res.setHeader('Validation-Token', validationToken);
        res.status(200).json({
            message: 'Set Header Validation'
        });
    } else {
        console.log(JSON.stringify(req.body));
        res.status(200).send(req.body);
        console.log("EventTpe: " + req.body.body.eventType);
        switch (req.body.body.eventType) {
            case "Delete":
                console.log("Bot Deleted")
                break; 
            case "GroupJoined":
                console.log("Group Joined :" + req.body.body.id);
                break; 
            case "PostAdded":
                console.log("Post Added :" + JSON.stringify(req.body.body));
                break;     
            default: 
                console.log("Default: " + JSON.stringify(req.body));
        }
   }
});

// Method to Get Bot Information.
function getBotIdentity(){
    platform.get('/account/~/extension/~')
        .then(function(extensionInfo){
            var identity = JSON.parse(extensionInfo.text());
            console.log("Bot Identity :" + JSON.stringify(identity));
            setTimeout(function() {
                botID = identity.id;
                subscribeToGlipEvents();
                IsBotAddedToGlip();
            }, 10000);
        }).catch(function(e){
            console.error(e);
            throw e;
        })
}

// Method to Check if the bot is added to Glip
// TODO: Need to find a better way to achive this task
function IsBotAddedToGlip(){
    platform.get('/glip/persons/'+botID)
        .then(function(botInfo){
               console.log("Bot is Added to Glip");
               createGroup(); 
        }).catch(function(e){
            console.log("Waiting for bot to be added to Glip...!");
            setTimeout(function() {
                IsBotAddedToGlip();
            }, 10000);
        })
}

// Method to Create Group
function createGroup(){
   console.log("In Create Group"); 
   console.log("BotID: "+ botID);
   console.log ("CreatorID: "+ creatorID);
   platform.post('/glip/groups',{
        type: "PrivateChat",
        members: [
            botID,
            creatorID
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
            //Get Glip Post Events
            "/restapi/v1.0/glip/posts", 
            //Get Glip Group Events
            "/restapi/v1.0/glip/groups",
            // Get Bot Extension Events (used to detect when a bot is removed)
            "/restapi/v1.0/account/~/extension/"+ botID
        ],
        "deliveryMode": {
            "transportType": "WebHook",
            "address": REDIRECT_HOST + "/glip/receive"
        },
        "expiresIn": 500000000
    };
    platform.post('/subscription', requestData)
        .then(function (subscriptionResponse) {
            console.log('Subscription Response: ', subscriptionResponse.json());
            subscription = subscriptionResponse.json();
            subscriptionId = subscriptionResponse.id;
        }).catch(function (e) {
            console.error(e);
            throw e;
    });
}

