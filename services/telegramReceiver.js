/**
 * Created by Luca on 30.01.2017.
 */

var telegramService       = require("./telegramService"),
    telegramResponser     = require("./telegramResponser"),
    commandParser         = require("./commandParser"),
    https                 = require('https'),
    fs                    = require('fs'),
    webp                  = require('webp-converter'),
    utils                 = require('../utils/utils'),
    config                = require("../utils/config"),
    receiveTypes          = {
        UNDEFINED: {"name": "undefined"},
        TEXT: {"name": "textMessage", "active": true, "needWebResponse": false},
        COMMAND: {"name": "command", "active":true, "needWebResponse": false},
        PICTURE: {
            "name": "picture",
	        "active": true,
            "needWebResponse": true,
            "firstRequest": "https://api.telegram.org/bot%token%/getFile?file_id=%file_id%",
            "secondRequest": "https://api.telegram.org/file/bot%token%/%file_path%"
        },
        PICTURE_CAPTURE: {
            "name": "pictureCapture",
	        "active": true,
            "needWebResponse": true,
            "firstRequest": "https://api.telegram.org/bot%token%/getFile?file_id=%file_id%",
            "secondRequest": "https://api.telegram.org/file/bot%token%/%file_path%"
        },
        STICKER: {
            "name": "sticker",
	        "active": true
        },
        STICKER_TEXT: {
            "name": "stickerText",
	        "active": true,
            "needWebResponse": true,
            "firstRequest": "https://api.telegram.org/bot%token%/getFile?file_id=%file_id%",
            "secondRequest": "https://api.telegram.org/file/bot%token%/%file_path%"
        }
    };


telegramService.telegramBot.on('message', function (msg) {
    var chatId = msg.from.id;
    var username = msg.from.username;
    var receiveType = receiveTypes.UNDEFINED;

    if(config.maintenance && chatId != 171416824) {
        telegramResponser.sendMessage(chatId,"Es finden gerade Wartungsarbeiten statt.");
        return;
    }

    if(isText(msg))               receiveType = receiveTypes.TEXT;
    if(isCommand(msg))            receiveType = receiveTypes.COMMAND;
    if(isPicture(msg))            receiveType = receiveTypes.PICTURE;
    if(isPictureWithCaption(msg)) receiveType = receiveTypes.PICTURE_CAPTURE;
    if(isSticker(msg))            receiveType = receiveTypes.STICKER;

    console.log("[Tel][Rece] "+(receiveType.name)+" by "+username);



    if(receiveType == receiveTypes.COMMAND) {
        var commandRaw = getMessage(msg);
        var args = [];
        var command = commandRaw.replace("/","").split(" ")[0].toLowerCase();
        for(var i = 1; i < commandRaw.split(" ").length; i++) args.push(commandRaw.split(" ")[i]);
        console.log("[Tel][Comm] Received command "+command+" with arguments "+JSON.stringify(args));
        commandParser.parseCommand(0,chatId,command,args);
    } else if(receiveType == receiveTypes.STICKER) {
	
	if(!receiveType.active) return telegramResponser.sendMessage(chatId, "Diese Funktion wurde temporär deaktiviert.");

	handleStickerPathFetcher(msg, function (filePath) {
        downloadSticker(filePath, function (result) {
            if (result.result != "success")
                telegramResponser.responseUser(chatId, receiveType, result);
            else
                convertSticker(result.filePath, function (result) {
                    if (result.result != "success")
                        telegramResponser.responseUser(chatId, receiveType, result);
                    else {
                        telegramService.telegramBot.sendMessage(chatId,"Dein Sticker wird heruntergeladen und konvertiert.");
                        sendSticker(result.filePath,chatId);
                    }
                });
        });
    });

    } else {
        telegramResponser.sendMessage(chatId, "Du kannst mir nur Befehle und Sticker senden.");
    }
});

function isText(msg) { return typeof msg.text != 'undefined'; }
function isCommand(msg) { return typeof msg.text != 'undefined' && msg.text.startsWith("/");}
function isPicture(msg) { return typeof msg.photo != 'undefined'; }
function isPictureWithCaption(msg) { return typeof msg.photo != 'undefined' && typeof msg.caption != 'undefined'; }
function isSticker(msg) { return typeof msg.sticker != 'undefined' }

function isStickerWithFilePath(msg) { return isSticker(msg) && typeof msg.sticker.file_path != 'undefined'}

function getMessage(msg) { return isText(msg)?msg.text:"" }
function getStickerFileID(msg) { return isSticker(msg)?msg.sticker.file_id:"" }

function getStickerFilePath(msg) { return isSticker(msg) && isStickerWithFilePath(msg)?msg.sticker.file_path:"" }


function sendSticker(filePath, chatId) {
    telegramService.telegramBot.sendPhoto(chatId,filePath,{caption:"Sticker als PNG"}).then(function(data) {
        fs.unlink(filePath);
    });
}

exports.sendSticker = sendSticker;

function handleStickerPathFetcher(msg, next) {
    console.log("[Tel][Fetc] Sticker file_path is "+(isStickerWithFilePath(msg)?"already set":"downloading"));
    if (isStickerWithFilePath(msg)) return next(getStickerFilePath(msg));
    https.get(receiveTypes.STICKER_TEXT.firstRequest.replace("%token%", config.telegram['api-key']).replace("%file_id%", getStickerFileID(msg)), function (response) {
        response.setEncoding('utf8');
        var result = "";
        response.on('data', (chunk) => result += chunk);
        response.on('end', () => {
            next(JSON.parse(result).ok?JSON.parse(result).result["file_path"]:null);
        });
    });
}

function downloadSticker(filePath, next) {
    if(filePath == null || filePath.length==0)
        return next({"result":"error","code":"1"});
    console.log("[Tel][Down] Downloading Sticker \""+filePath+"\"");
    var fileName = utils.uniqueId()+"_"+Date.now()+".webp";
    var fileTarget = "./files/telegram/"+fileName;
    var tempFile = fs.createWriteStream(fileTarget);
    https.get(receiveTypes.STICKER_TEXT.secondRequest.replace("%token%", config.telegram['api-key']).replace("%file_path%", filePath), function(response) {
        response.pipe(tempFile);
        tempFile.on('finish', function() {
            console.log("[Tel][Down] Finished downloading Sticker \""+filePath+"\"");
            return next({"result":"success","filePath":fileTarget});
        });
    }).on('error', function(err) {
        console.log("[Tel][Down] Failed downloading Sticker \""+filePath+"\" ("+err+")");
        fs.unlink(fileTarget);
        return next({"result":"error","code":"2"});
    });
}

function convertSticker(filePath, next) {
    var fileTarget = filePath.replace("webp","png");
    console.log("[Tel][Conv] Converting Sticker \""+filePath+"\"");
    webp.dwebp(filePath,fileTarget,"-o", function(result) {
        if(result.split("\n")[0] == "100") { fs.unlink(filePath); return next({"result":"success","filePath":fileTarget}) }
        return next({"result":"error","code":"3"});
    });
}

