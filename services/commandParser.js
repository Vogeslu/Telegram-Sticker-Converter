/**
 * Created by Luca on 22.05.2017.
 */
var telegramResponser = require("./telegramResponser"),
    telegramReceiver  = require("./telegramReceiver"),
    commandResponses  = require("./commandResponses");

module.exports = {
    parseCommand: function(type, chatId, commandName, args) {

        var argumentText = ""; for(var i = 0; i < args.length; i++) argumentText+=args[i]+" ";

        if(commandName=="start") { return telegramResponser.sendMessage(chatId, commandResponses.startMessage_telegram); }
        if(commandName=="help") { return telegramResponser.sendMessage(chatId, commandResponses.resultHelp_telegram); }
        return  type==0?telegramResponser.sendMessage(chatId, "Unbekannter Befehl. (/commands)"):twitterResponser.sendMessage(chatId, "Unbekannter Befehl. (/commands)");
    }
}
