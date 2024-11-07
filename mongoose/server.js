const dotENV = require('dotenv');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const session = require('express-session');
const JWT = require('jsonwebtoken');
const bCrypt = require('bcrypt');
const multer = require('multer');

// --- 여기서부터 데이터 모델 등록 ---

const dataBase = require('./model');
const User = require('./registerModel');
const Users = require('./userModel');
const Post = require('./postModel');
const Reply = require('./replyModel');
const Guestbook = require('./guestModel');
const GuestbookReply = require('./guestReplyModel');

// --- 데이터 모델 등록 끝 ---

dotENV.config({path: '../.env'});

const app = express();
const upload = multer({ dest: 'uploads/' });
const SECRET_KEY = process.env.JWT_SECRET_KEY || 'default_secret_key';

app.use(cors({
    origin: 'http://localhost:5173',
    methods: [ 'GET', 'POST', 'PUT', 'DELETE' ],
    allowedHeaders: [ 'Content-Type', 'Authorization' ],
    credentials: true
}));

app.use(cookieParser());
app.use(bodyParser.json({ limit: '10mb' })); // 요청 최대 크기 제한
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
app.use(session({
    key: 'loginData',
    secret: 'testSecret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        expires: 60 * 60 * 24
    }
}));

app.use('/uploads', express.static('uploads'));

dataBase.main();

app.get('/', (req, res) => {
    res.status(200).json({ message: 'Connected!' });
});



// --- 사용자 관련 요청 ---

app.post('/register', upload.single('userImage'), async (req, res) => { // 회원 가입
    const { type, userAccount, userPassword, userName, likedArticles, commentedArticles, followers, followings } = req.body;
    const userImage = req.file;

    try {
        if (!userAccount || !userPassword || !userName) {
            return res.status(400).json({ message: '필수 정보가 입력되지 않았습니다.' });
        }

        if (userPassword.length < 8) {
            return res.status(400).json({ message: '비밀번호는 8자리 이상이어야 합니다.' });
        }

        const isAccountExist = await User.findOne({ account: userAccount });

        if (isAccountExist) {
            return res.status(400).json({ message: '이미 등록된 계정입니다.' });
        }

        const hashedPassword = await bCrypt.hash(userPassword, 10);

        const newUser = new User({
            type,
            userAccount,
            password: hashedPassword,
            userName,
            userImage: userImage ? userImage.path : null,
            likedArticles,
            commentedArticles,
            followers,
            followings
        });

        await newUser.save();

        res.status(200).json({ message: '회원 등록이 완료되었습니다.' });
    } catch(error) {
        if (error.name == 'MongoNetworkError') {
            return res.status(500).json({ message: 'Database 연결에 실패했습니다.' });
        }

        res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
});

app.post('/login', async (req, res) => { // 사용자 로그인
    const { userAccount, userPassword } = req.body;

    try {
        // 유저 찾기
        const user = await Users.findOne({ account: userAccount });

        if (!user) {
            return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
        }

        // 비밀번호 비교
        const isMatch = await bCrypt.compare(userPassword, user.password);

        if (!isMatch) {
            return res.status(400).json({ message: '비밀번호가 일치하지 않습니다.' });
        }

        const token = JWT.sign(
            {
                id: user._id,
                account: user.userAccount,
            }, SECRET_KEY, { expiresIn: '1h' }
        );

        res.status(200).json({ user, token });
    } catch(error) {
        res.status(500).json({ message: '로그인 실패' });
    }
});

const tokenMiddleware = async (req, res, next) => { // JWT 검증을 위한 미들웨어
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    JWT.verify(token, SECRET_KEY, async (error, decoded) => {
        if (error) return res.sendStatus(403);

        try{
            const user = await User.findById(decoded.id);

            if (!user) return res.sendStatus(404);

            req.user = user;

            next();
        } catch(error) {
            res.status(500).json({ message: '서버 오류 발생' });
        }
    });
};

app.get('/profile', tokenMiddleware, async (req, res) => { // 토큰 검증을 통해 사용자 프로파일 가져오기
    try {
        res.status(200).json(req.user);
    } catch(error) {
        res.status(500).json({ message: '사용자 정보 조회 실패' });
    }
});

app.get('/admin-info', async (req, res) => { // 블로그 관리자 정보 가져오기
    try {
        const admin = await Users.findOne({ type: 'admin' });

        if (!admin) {
            return res.status(404).json({ message: '관리자를 찾을 수 없습니다.' });
        }

        res.status(200).json({
            adminID: admin._id,
            adminName: admin.userName,
            adminImage: admin.userImage,
            followers: admin.followers,
            blogInfo: admin.blogSettings
        });
    } catch(error) {
        res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
});

app.get('/my-page', async(req, res) => { // 사용자 마이 페이지
    const { account } = req.body;

    try{
        const findUser = await Users.findOne( account );

        if (!findUser) {
            return res.status(404).json({ message: '사용자를 찾을 수 없습니다' });
        }

        res.status(200).json({
            _id: findUser._id,
            account: findUser.account,
            userName: findUser.userName,
            userImage: findUser.userImage,
            commentedArticles: findUser.commentedArticles,
        });
    } catch (error) {
        res.status(500).json({ message: '유저 찾기 실패' });
    }
});

app.get('/users', async (req, res) => { // 전체 사용자 목록 가져오기
    try {
        const users = await Users.find();

        res.status(200).json(users);
    } catch (err) {
        res.status(500).json({ message: 'failed bring users' })
    }
});

app.get('/user-info/:id', async (req, res) => { // 개별 사용자 정보 가져오기
    try {
        const user = await Users.findById(req.params.id);

        res.status(200).json(user);
    } catch(error) {
        res.status(500).json({ message: 'Failed bring user' });
    }
});

app.post('/user-info/edit', upload.single('userImage'), async (req, res) => { // 사용자 정보 수정
    const { _id, userName, account } = req.body;
    const userImage = req.file ? req.file.path : null;

    try{
        const updatedUser = await Users.findOneAndUpdate(
            { _id: _id },
            { userName, userImage, account },
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ message: '사용자를 찾을 수 없습니다' });
        }

        res.status(200).json({
            _id: updatedUser._id,
            account: updatedUser.account,
            userName: updatedUser.userName,
            userImage: updatedUser.userImage,
        });
    } catch(error) {
        res.status(500).json({ message: '사용자 정보 수정 실패', error });
    }
});

app.delete('/quit', async (req, res) => { // 회원 탈퇴

});



// --- 포스트 관련 요청 ---

app.post('/post', async (req, res) => { // 포스트 작성
    const { title, category, movieID, text, images, author } = req.body;

    try {
        const newPost = new Post({
            title,
            thumbIndex: 0,
            category: Number(category),
            movieID,
            text,
            images: images,
            author
        });

        await newPost.save();

        res.status(200).json({ message: 'Post saved Successgully' });
    } catch(error) {
        console.error(error);
        res.status(500).json({ message: 'Post failed' });
    }
});

app.get('/posts', async (req, res) => { // 포스트 전체 목록 가져오기
    try {
        const posts = await Post.find();

        res.status(200).json(posts.sort((a, b) => { return b.createdAt - a.createdAt }));
    } catch(error) {
        res.status(500).json({ message: 'Failed bring posts' });
    }
});

app.get('/posts/:id', async(req, res) => { // 개별 포스트 가져오기
    const { id } = req.params;
    try {
        const post = await Post.findOne({ _id: id });
        if (!post) {
            return res.status(404).json({ message: "포스트를 찾을 수 없음" });
        }

        res.status(200).json(post);
    } catch(error) {
        res.status(500).json({ message: 'failed to find', error: error.message });
    }
})

app.post('/posts/:postId/like', async (req, res) => { // 포스트 좋아요, 좋아요 취소
    const postId = req.params.postId;
    const { userId } = req.body

    try {
        const post = await Post.findOne({ _id: postId });
        if (!post) {
            return res.status(404).json({message : "포스트를 찾을 수 없습니다."})
        }

        const user = await Users.findOne({ _id: userId });
        if (!user) {
            return res.status(404).json({ message: "유저를 찾을 수 없습니다." });
        }

        // likedArticles가 존재하지 않으면 생성
        if (!user.likedArticles) {
            user.likedArticles = [];
        }
        const alreadyLiked = user.likedArticles.includes(postId);

        if (!alreadyLiked) {
            post.likes += 1;
            user.likedArticles.push(postId);
            await post.save();
            await user.save();
            return res.status(200).json({message: '좋아요 추가 성공', post})
        } else {

            post.likes -= 1;
            user.likedArticles = user.likedArticles.filter(id => id !== postId);
            await post.save();
            await user.save();
            return res.status(200).json({ message: '좋아요 취소 성공', likes: post.likes });
        }
    } catch(error) {
        res.status(500).json({message: '좋아요 중 오류 발생'})
    }
});

app.put('/posts/:id', async(req, res) => { // 포스트 수정
    const { id } = req.params;
    const { title, text, category, images } = req.body;

    try {
        const editPost = await Post.findByIdAndUpdate(
            id,
            { title, text, category, images },
            { new: true }
        );

        res.status(200).json({ message: 'Post edited' });
    } catch(error) {
        res.status(500).json({ message: 'Edit failed' });
    }
});

app.delete('/posts/:id', async(req, res) => { // 포스트 삭제
    const { id } = req.params;

    try {
        await Post.findByIdAndDelete(id);

        res.json({ message: 'Post deleted' });
    } catch(error) {
        res.status(500).json({ message: 'Delete failed' });
    }
});



// --- 댓글 관련 요청 ---

app.post('/reply/:postID', async (req, res) => { // 댓글, 대댓글 작성
    const postID = req.params.postID;
    const { replyTarget, userID, userName, password, replyText, reReplies } = req.body;

    console.log(replyTarget)

    try {
        const post = await Post.findById(postID);
        const targetReply = replyTarget.target === 'reply' ? await Reply.findById(replyTarget.targetID) : null;

        if (!post) {
            return res.status(404).json({ message: '포스트를 찾을 수 없습니다.' });
        }

        const user = await Users.findById(userID);

        if (!user) console.log('유저가 존재하지 않습니다.');

        // commentedArticles가 존재하지 않으면 생성
        if (user && !user.commentedArticles) {
            user.commentedArticles = [];
        }

        const newComment = new Reply({
            replyTarget: replyTarget,
            repliedArticle: postID,
            userID: userID,
            userName: userName,
            password: password ?? null,
            replyText: replyText,
            reReplies: reReplies
        });

        const savedComment = await newComment.save();

        post.comments.push(newComment._id);

        // 사용자가 이 포스트에 대한 첫 댓글이라면 userModel의 commentedArticles에 postId 추가
        if (user && !user.commentedArticles.includes(postID)) {
            user.commentedArticles.push(postID);
        }

        if (replyTarget.target === 'reply') {
            targetReply.reReplies.push(savedComment._id);

            await targetReply.save();
        }

        await post.save();
        if (user) await user.save();

        return res.status(200).json({ message: 'Reply Attached Successfully' });
    } catch (error) {
        console.error('댓글 추가 중 오류:', error.message);
        res.status(500).json({ message: '댓글 추가 중 오류가 발생했습니다.' });
    }
});

app.get('/replies/:id', async (req, res) => { // 댓글 가져오기
    try {
        const replies = await Reply.findById(req.params.id);

        res.json(replies);
    } catch(error) {
        res.status(500).json({ message: 'An error occurred' });
    }
});

app.get('/replies/post/:id', async (req, res) => { // 포스트에 해당되는 댓글 전체 가져오기
    try {
        const replies = await Reply.find({ repliedArticle: req.params.id });

        res.json(replies);
    } catch(error) {
        res.status(500).json({ message: 'An error occurred' });
    }
});

app.delete('/reply/:replyID', async (req, res) => { // 댓글 삭제
    const replyID = req.params.replyID;
    const postID = req.body.postID;
    const inputPassword = req.body.password;

    try {
        const post = await Post.findById(postID);
        const replyToDelete = await Reply.findById(replyID);
        const isReplyExist = post.comments.find(reply => reply === replyID);

        console.log(replyToDelete)
        console.log(inputPassword);

        if (!post) {
            return res.status(404).json({ message: '포스트를 찾을 수 없습니다.' });
        }

        if (!!isReplyExist === false) {
            return res.status(404).json({ message: '댓글을 찾을 수 없습니다.' });
        }

        if (replyToDelete) {
            if (replyToDelete.password !== inputPassword) {
                return res.status(403).json({ message: '비밀번호가 일치하지 않습니다.' });
            }
        } else {
            return res.status(404).json({ message: '댓글을 찾을 수 없습니다.' });
        }

        post.comments.filter(reply => reply !== replyID); // 대상 댓글이 존재하는 Post 의 comment 배열에서 해당 댓글 제거

        await post.save();
        await Reply.findByIdAndDelete(replyID);

        return res.status(200).json({ message: '댓글이 삭제되었습니다.', post });
    } catch(error) {
        res.status(500).json({ message: '댓글 삭제 중 오류가 발생했습니다.' });
    }
});



// --- 방명록 관련 요청 ---

app.post('/guestbooks/write', async (req, res) => { // 방명록 작성
    const { isUser, userID, userName, password, text } = req.body;

    try {
        const newGuestbook = new Guestbook({
            writtenUser: {
                isUser,
                userID,
                userName,
                password
            },
            text,
            replies: []
        });

        await newGuestbook.save();

        res.status(200).json({ message: 'Guestbook Posted Successfully' });
    } catch(error) {
        res.status(500).json({ message: 'An error occurred' });
    }
});

app.get('/guestbooks', async (req, res) => { // 방명록 가져오기
    try {
        const guestbookList = await Guestbook.find();

        res.json(guestbookList.sort((a, b) => { return b.createdAt - a.createdAt }));
    } catch(error) {
        res.status(500).json({ message: 'An error occurred' });
    }
});

app.delete('/guestbooks/:id', async (req, res) => { // 방명록 글 삭제
    try {
        await Guestbook.findByIdAndDelete(req.params.id);

        res.status(200).json({ message: 'Guestbook Removed Successfully' });
    } catch(error) {
        res.status(500).json({ message: 'An error occurred' });
    }
});

app.post('/guestbooks/reply/:id', async (req, res) => { // 방명록 답글 작성 - 미완성
    try {
        const newGuestbookReply = new GuestbookReply(req.body);
        const targetGuestbook = Guestbook.findByIdAndUpdate(req.params.id, targetGuestbook.replies.push(newGuestbookReply._id));

        await newGuestbookReply.save();

        res.status(200).json({ message: 'Guestbook Reply Attached Successfully' });
    } catch(error) {
        res.status(500).json({ message: 'An error occurred' });
    }
});

app.get('/guestbooks/replies/:id', async (req, res) => { // 방명록 글의 전체 답글 가져오기
    try {
        const replies = await GuestbookReply.find({ targetGuestbook: req.params.id });

        res.status(200).json(replies);
    } catch(error) {
        res.status(500).json({ message: 'An error occurred' });
    }
});



// --- 팔로우 / 언팔로우 관련 요청 ---

app.post('/users/:userId/follow', async (req, res, next) => {
    const { userID, followerID } = req.body;

    try {
        const updatedUser = await Users.findByIdAndUpdate(
            userID,
            { $push: { followers: { follower: followerID } } },
            { safe: true, upsert: true, new: true}
        );

        const updatedFollower = await Follow.findByIdAndUpdate(
            followerID,
            { $push: { users: { user: userID } } },
            { safe: true, upsert: true, new: true}
        );

        const userWithFollowers = await Users.findById(userID).select('followers');
        console.log('Updated followers:', userWithFollowers.followers);

        res.status(200).json({ user: updatedUser, follower: updatedFollower });
    } catch (error) {
        next(error)
    }
});

app.post('/users/:userId/unfollow', async (req, res, next) => {
    const { userID, followerID } = req.body;

    try {
        const updatedUser = await Users.findByIdAndUpdate(
            userID,
            { $pull: { followers: { follower: followerID } } },
            { safe: true, upsert: true, new: true}
        );

        const updatedFollower = await Follow.findByIdAndUpdate(
            followerID,
            { $pull: { users: { user: userID } } },
            { safe: true, upsert: true, new: true}
        );

        res.status(200).json({ user: updatedUser, follower: updatedFollower });
    } catch (error) {
        next(error)
    }
});



// --- 서버 시작 ---

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${ PORT }.`);
});