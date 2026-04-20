DROP TABLE IF EXISTS post_upvote;
DROP TABLE IF EXISTS likes;
DROP TABLE IF EXISTS comment;
DROP TABLE IF EXISTS post;
DROP TABLE IF EXISTS pin;
DROP TABLE IF EXISTS account;

CREATE TABLE account (
	id INTEGER PRIMARY KEY,
	name VARCHAR(100),
	email VARCHAR(254) UNIQUE NOT NULL,
	password VARCHAR(60)
);

CREATE TABLE pin (
	id INTEGER PRIMARY KEY,
	creatorID INTEGER,
	latitude REAL,
	longitude REAL,
	title VARCHAR(200),
	address VARCHAR(200),
	description VARCHAR(500),
	tags VARCHAR(200),
	image VARCHAR(2000),
	likes INTEGER DEFAULT 0,
	FOREIGN KEY (creatorID) REFERENCES account(id) ON DELETE CASCADE
);

CREATE TABLE comment (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	pinID INTEGER,
	accountID INTEGER,
	comment VARCHAR(280),
	createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (pinID) REFERENCES pin(id) ON DELETE CASCADE,
	FOREIGN KEY (accountID) REFERENCES account(id) ON DELETE CASCADE
);

CREATE TABLE likes (
	pinID INTEGER,
	accountID INTEGER,
	PRIMARY KEY (pinID, accountID),
	FOREIGN KEY (pinID) REFERENCES pin(id) ON DELETE CASCADE,
	FOREIGN KEY (accountID) REFERENCES account(id) ON DELETE CASCADE
);

CREATE TABLE post (
	id INTEGER PRIMARY KEY,
	creatorID INTEGER,
	title VARCHAR(100) NOT NULL,
	location VARCHAR(200) NOT NULL,
	category VARCHAR(20) DEFAULT 'New',
	tags VARCHAR(500),
	message TEXT NOT NULL,
	image VARCHAR(2000),
	upvotes INTEGER DEFAULT 0,
	createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (creatorID) REFERENCES account(id) ON DELETE CASCADE
);

CREATE TABLE post_upvote (
	postID INTEGER,
	accountID INTEGER,
	PRIMARY KEY (postID, accountID),
	FOREIGN KEY (postID) REFERENCES post(id) ON DELETE CASCADE,
	FOREIGN KEY (accountID) REFERENCES account(id)
);

CREATE TABLE itinerary (
	id TEXT PRIMARY KEY,
	data TEXT NOT NULL,
	createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common query patterns
CREATE INDEX idx_pin_creatorID ON pin(creatorID);
CREATE INDEX idx_comment_pinID ON comment(pinID);
CREATE INDEX idx_comment_accountID ON comment(accountID);
CREATE INDEX idx_likes_pinID ON likes(pinID);
CREATE INDEX idx_likes_accountID ON likes(accountID);
CREATE INDEX idx_account_email ON account(email);
CREATE INDEX idx_post_creatorID ON post(creatorID);
CREATE INDEX idx_post_upvote_postID ON post_upvote(postID);
