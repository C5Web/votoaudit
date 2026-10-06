-- Torna o registro de auditoria administrativa append-only no próprio banco.
-- Nenhum usuário da aplicação consegue alterar ou apagar linhas (nem o administrador geral).
-- Aplicar com: yarn prisma db execute --file prisma/sql/admin_audit_log_append_only.sql --schema prisma/schema.prisma
CREATE OR REPLACE FUNCTION votoaudit_block_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AdminAuditLog é somente de inclusão (append-only).';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_audit_log_no_update_delete ON "AdminAuditLog";
CREATE TRIGGER admin_audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON "AdminAuditLog"
  FOR EACH ROW EXECUTE FUNCTION votoaudit_block_audit_mutation();

DROP TRIGGER IF EXISTS admin_audit_log_no_truncate ON "AdminAuditLog";
CREATE TRIGGER admin_audit_log_no_truncate
  BEFORE TRUNCATE ON "AdminAuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION votoaudit_block_audit_mutation();
