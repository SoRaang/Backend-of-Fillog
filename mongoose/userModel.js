const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        default: 'user'
    },
    account: {
        type: String,
        required: true,
    },
    password: {
        type: String,
        required: true
    },
    userName: {
        type: String,
        required: true
    },
    userImage: { type: String },
    commentedArticles: [ String ],
    likedArticles: [ String ],
    followers: [ String ],
    followings: [ String ],
    blogSettings: {
        blogName: String,
        favoriteGenres: [ Number ],
        blogCategories: [ // 카테고리 직접 설정 여부는 나중에 생각
            {
                id: Number,
                name: String
            }
        ]
    },
    dateCreated: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Users', userSchema);