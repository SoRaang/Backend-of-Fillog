const mongoose = require('mongoose');
const Post = require('./postModel');
const postData = require('./basic-datas/postData.json');

// 해당 파일 실행시 임시 포스트데이터 DB에 저장됨

mongoose.connect('mongodb://localhost:27017')
    .then(() => { return insertPosts() })
    .catch(error => { console.error('MongoDB 연결 오류 :', error) });

async function insertPosts() {
    try {
        for (const postEntry of postData) {
            const post = new Post(postEntry);

            await post.save();

            console.log('포스트 데이터 입력 성공');
        }
    } catch(error) {
        console.error('오류 발생 :', error);
    } finally {
        mongoose.connection.close();
    }
}