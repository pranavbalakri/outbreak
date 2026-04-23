-- Sub-folder support: a folder can optionally live under another folder.
ALTER TABLE "folders"
    ADD COLUMN "parent_folder_id" TEXT;

ALTER TABLE "folders"
    ADD CONSTRAINT "folders_parent_folder_id_fkey"
    FOREIGN KEY ("parent_folder_id") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "folders_parent_folder_id_idx" ON "folders"("parent_folder_id");
