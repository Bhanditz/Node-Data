'use strict';

var mongoose = require('mongoose');
var db = require("../db");;
var Message = new mongoose.Schema({
  channel: String,
  timestamp: {type: Date, default: Date.now},
  message: {}
}, {
  capped: {
    size: 1024 * 16 * 25, // in bytes
        autoIndexId: true

    },
    validateBeforeSave: false
});

export function getMessage()
{
    return db.getDbSpecifcModel('Message', Message);
}

