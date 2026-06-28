DROP TABLE IF EXISTS challenge_progress;
DROP TABLE IF EXISTS challenge;
DROP TABLE IF EXISTS notification;
DROP TABLE IF EXISTS comment_reaction;
DROP TABLE IF EXISTS bookmark;
DROP TABLE IF EXISTS bookmark_folder;
DROP TABLE IF EXISTS search_history;
DROP TABLE IF EXISTS pin_status;
DROP TABLE IF EXISTS itinerary;
DROP TABLE IF EXISTS post_upvote;
DROP TABLE IF EXISTS likes;
DROP TABLE IF EXISTS comment;
DROP TABLE IF EXISTS post;
DROP TABLE IF EXISTS pin;
DROP TABLE IF EXISTS user_follow;
DROP TABLE IF EXISTS account;

CREATE TABLE account (
	id INTEGER PRIMARY KEY,
	name VARCHAR(100),
	email VARCHAR(254) UNIQUE NOT NULL,
	password VARCHAR(60),
	bio VARCHAR(300),
	avatar VARCHAR(2000),
	profileVisibility TEXT DEFAULT 'public' CHECK(profileVisibility IN ('public','friends','private'))
);

CREATE TABLE user_follow (
	followerID INTEGER NOT NULL,
	followingID INTEGER NOT NULL,
	createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (followerID, followingID),
	FOREIGN KEY (followerID) REFERENCES account(id) ON DELETE CASCADE,
	FOREIGN KEY (followingID) REFERENCES account(id) ON DELETE CASCADE,
	CHECK (followerID != followingID)
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
	createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
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
	latitude REAL,
	longitude REAL,
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

CREATE TABLE pin_status (
	pinID INTEGER NOT NULL,
	accountID INTEGER NOT NULL,
	status TEXT NOT NULL CHECK(status IN ('visited','wishlist')),
	updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (pinID, accountID),
	FOREIGN KEY (pinID) REFERENCES pin(id) ON DELETE CASCADE,
	FOREIGN KEY (accountID) REFERENCES account(id) ON DELETE CASCADE
);

CREATE TABLE search_history (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	accountID INTEGER NOT NULL,
	query VARCHAR(200) NOT NULL,
	createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (accountID) REFERENCES account(id) ON DELETE CASCADE
);

CREATE TABLE itinerary (
	id TEXT PRIMARY KEY,
	creatorID INTEGER,
	title TEXT,
	data TEXT NOT NULL,
	isPublic INTEGER NOT NULL DEFAULT 0,
	carbonKg REAL,
	savedKg REAL,
	createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (creatorID) REFERENCES account(id) ON DELETE CASCADE
);

CREATE TABLE bookmark_folder (
	id TEXT PRIMARY KEY,
	accountID INTEGER NOT NULL,
	name VARCHAR(80) NOT NULL,
	createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
	isPublic INTEGER DEFAULT 0,
	FOREIGN KEY (accountID) REFERENCES account(id) ON DELETE CASCADE
);

CREATE TABLE bookmark (
	pinID INTEGER NOT NULL,
	accountID INTEGER NOT NULL,
	folderID TEXT,
	createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (pinID, accountID),
	FOREIGN KEY (pinID) REFERENCES pin(id) ON DELETE CASCADE,
	FOREIGN KEY (accountID) REFERENCES account(id) ON DELETE CASCADE,
	FOREIGN KEY (folderID) REFERENCES bookmark_folder(id) ON DELETE SET NULL
);

CREATE TABLE comment_reaction (
	commentID INTEGER NOT NULL,
	accountID INTEGER NOT NULL,
	emoji VARCHAR(8) NOT NULL,
	createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (commentID, accountID, emoji),
	FOREIGN KEY (commentID) REFERENCES comment(id) ON DELETE CASCADE,
	FOREIGN KEY (accountID) REFERENCES account(id) ON DELETE CASCADE
);

CREATE TABLE notification (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	recipientID INTEGER NOT NULL,
	actorID INTEGER,
	type TEXT NOT NULL,
	entityType TEXT,
	entityID INTEGER,
	isRead INTEGER NOT NULL DEFAULT 0,
	createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (recipientID) REFERENCES account(id) ON DELETE CASCADE,
	FOREIGN KEY (actorID) REFERENCES account(id) ON DELETE CASCADE
);

CREATE TABLE challenge (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	code TEXT UNIQUE NOT NULL,
	title VARCHAR(120) NOT NULL,
	description VARCHAR(300),
	metric TEXT NOT NULL,
	goal REAL NOT NULL,
	icon VARCHAR(8),
	active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE challenge_progress (
	challengeID INTEGER NOT NULL,
	accountID INTEGER NOT NULL,
	progress REAL NOT NULL DEFAULT 0,
	completedAt DATETIME,
	updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (challengeID, accountID),
	FOREIGN KEY (challengeID) REFERENCES challenge(id) ON DELETE CASCADE,
	FOREIGN KEY (accountID) REFERENCES account(id) ON DELETE CASCADE
);

-- Indexes for common query patterns
CREATE INDEX idx_pin_creatorID ON pin(creatorID);
CREATE INDEX idx_pin_title ON pin(title);
CREATE INDEX idx_pin_tags ON pin(tags);
CREATE INDEX idx_comment_pinID ON comment(pinID);
CREATE INDEX idx_comment_accountID ON comment(accountID);
CREATE INDEX idx_likes_pinID ON likes(pinID);
CREATE INDEX idx_likes_accountID ON likes(accountID);
CREATE INDEX idx_account_email ON account(email);
CREATE INDEX idx_post_creatorID ON post(creatorID);
CREATE INDEX idx_post_title ON post(title);
CREATE INDEX idx_post_tags ON post(tags);
CREATE INDEX idx_post_upvote_postID ON post_upvote(postID);
CREATE INDEX idx_pin_createdAt ON pin(createdAt);
CREATE INDEX idx_pin_status_accountID ON pin_status(accountID);
CREATE INDEX idx_search_history_user_time ON search_history(accountID, createdAt DESC);
CREATE INDEX idx_bookmark_folder_user ON bookmark_folder(accountID, createdAt DESC);
CREATE INDEX idx_bookmark_user_folder ON bookmark(accountID, folderID, createdAt DESC);
CREATE INDEX idx_bookmark_folder_public ON bookmark_folder(isPublic);
CREATE INDEX idx_comment_reaction_comment ON comment_reaction(commentID);
CREATE INDEX idx_comment_reaction_account ON comment_reaction(accountID);
CREATE INDEX idx_post_coords ON post(latitude, longitude);
CREATE INDEX idx_user_follow_follower ON user_follow(followerID);
CREATE INDEX idx_user_follow_following ON user_follow(followingID);
CREATE INDEX idx_notification_recipient ON notification(recipientID, isRead, createdAt DESC);
CREATE INDEX idx_itinerary_creator ON itinerary(creatorID, createdAt DESC);
CREATE INDEX idx_challenge_progress_account ON challenge_progress(accountID);

-- Default eco-challenges (keep in sync with seedChallenges() in db.ts)
INSERT INTO challenge (code, title, description, metric, goal, icon) VALUES
	('eco_explorer', 'Eco Explorer', 'Plan 5 low-carbon trips', 'trips_saved', 5, '🌍'),
	('carbon_saver', 'Carbon Saver', 'Save 100 kg of CO₂ versus typical travel', 'carbon_saved', 100, '🌱'),
	('climate_champion', 'Climate Champion', 'Save 500 kg of CO₂', 'carbon_saved', 500, '🏆'),
	('local_legend', 'Local Legend', 'Visit 10 community places', 'places_visited', 10, '📍');
