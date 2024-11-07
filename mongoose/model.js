const mongoose = require('mongoose');
const url = 'mongodb://127.0.0.1/';

exports.main = async () => {
    await mongoose.connect(url).then(() => {
        console.warn('Database Connected');
    }).catch((err) => {
        console.log(err);
    }
)}