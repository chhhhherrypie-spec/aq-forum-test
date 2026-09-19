CREATE TRIGGER points_apply AFTER INSERT ON point_transactions BEGIN
 UPDATE users SET points=points+NEW.amount WHERE id=NEW.user_id;
 UPDATE point_transactions SET balance_after=(SELECT points FROM users WHERE id=NEW.user_id) WHERE id=NEW.id;
 UPDATE posts SET points_awarded=NEW.amount WHERE id=NEW.source_id AND NEW.type IN ('post_article','post_image','post_video','post_chat');
 UPDATE comments SET points_awarded=NEW.amount WHERE id=NEW.source_id AND NEW.type='comment';
END;
--> statement-breakpoint
CREATE TRIGGER comment_count_add AFTER INSERT ON comments BEGIN
 UPDATE posts SET comment_count=comment_count+1 WHERE id=NEW.post_id;
END;
--> statement-breakpoint
CREATE TRIGGER comment_count_remove AFTER UPDATE OF status ON comments WHEN NEW.status<>OLD.status BEGIN
 UPDATE posts SET comment_count=comment_count + CASE WHEN NEW.status='published' THEN 1 ELSE -1 END WHERE id=NEW.post_id;
END;
--> statement-breakpoint
CREATE TRIGGER checkin_ban BEFORE INSERT ON check_ins WHEN EXISTS(SELECT 1 FROM bans WHERE user_id=NEW.user_id AND status='active' AND start_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND (end_at IS NULL OR end_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))) BEGIN
 SELECT RAISE(ABORT,'ACCOUNT_BANNED');
END;
--> statement-breakpoint
CREATE TRIGGER post_permission BEFORE INSERT ON posts BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM bans WHERE user_id=NEW.user_id AND status='active' AND start_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND (end_at IS NULL OR end_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))) THEN RAISE(ABORT,'ACCOUNT_BANNED') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND role<>'admin' AND points<COALESCE((SELECT json_extract(value,'$.post_threshold') FROM settings WHERE id='config'),10)) THEN RAISE(ABORT,'POST_PERMISSION_DENIED') END;
END;
--> statement-breakpoint
CREATE TRIGGER comment_permission BEFORE INSERT ON comments BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM bans WHERE user_id=NEW.user_id AND status='active' AND start_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND (end_at IS NULL OR end_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))) THEN RAISE(ABORT,'ACCOUNT_BANNED') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND role<>'admin' AND points<COALESCE((SELECT json_extract(value,'$.comment_threshold') FROM settings WHERE id='config'),30)) THEN RAISE(ABORT,'COMMENT_PERMISSION_DENIED') END;
END;
--> statement-breakpoint
CREATE TRIGGER reward_ban BEFORE INSERT ON point_transactions WHEN NEW.amount>0 AND EXISTS(SELECT 1 FROM bans WHERE user_id=NEW.user_id AND status='active' AND start_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND (end_at IS NULL OR end_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))) BEGIN
 SELECT RAISE(ABORT,'ACCOUNT_BANNED');
END;
