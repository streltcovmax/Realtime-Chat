INSERT INTO users VALUES ('user_a', 'a', 0);
INSERT INTO users VALUES ('user_b', 'b', 0);
INSERT INTO users VALUES ('user_c', 'c', 0);
INSERT INTO users VALUES ('user_d', 'd', 0);

INSERT INTO chats VALUES (0, 'msg1');
INSERT INTO chats VALUES (1, 'msg2');
INSERT INTO chats VALUES (2, 'msg3');

INSERT INTO chat_participants VALUES (0, 'user_a');
INSERT INTO chat_participants VALUES (1, 'user_a');
INSERT INTO chat_participants VALUES (2, 'user_a');

INSERT INTO chat_participants VALUES (0, 'user_b');

INSERT INTO chat_participants VALUES (1, 'user_c');

INSERT INTO chat_participants VALUES (2, 'user_d');


SELECT * FROM users;

drop table users cascade;

