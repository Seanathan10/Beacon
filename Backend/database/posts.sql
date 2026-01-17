-- Posts table for community posts
-- Run this separately from create.sql to avoid modifying existing DB

DROP TABLE IF EXISTS post;
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

    FOREIGN KEY (creatorID) REFERENCES account(id)
);

-- Optional: Add some seed data
INSERT INTO post (creatorID, title, location, category, tags, message, image, upvotes) VALUES
    (NULL, 'Taco Bell', '1405 Mission St, Santa Cruz, CA', 'Hot', 'Food,Casual', 'Authentic Latinx cuisine, straight from the heart of Santa Cruz.', 'https://s3-media0.fl.yelpcdn.com/bphoto/xla2vDAWBz4b3y3d0iVHuw/348s.jpg', 10),
    (NULL, 'Matcha Labubu Cafe', '16th Ave, Santa Cruz, CA 95062', 'Trendy', 'Cafe,Boba,Dessert', 'A cute little cafe with amazing matcha desserts and boba drinks.', 'https://www.matchacafe-maiko.com/assets/img/store/store-ga-atlanta.jpg', 8),
    (NULL, 'Farmers Market', '700 Front Street, Santa Cruz, CA 95060', 'Local', 'Community,Fresh Produce', 'A small popup farmer''s market near Trader Joe''s.', 'https://californiagrown.org/wp-content/uploads/2022/07/Paprika-Studios-CAG-Ag-Tour-Felton-Market-9176-copy.jpg', 5);
