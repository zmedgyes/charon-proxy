CREATE TABLE forward_rules (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	local_port INTEGER NOT NULL UNIQUE,
	remote_user TEXT NOT NULL,
	remote_port INTEGER NOT NULL
);