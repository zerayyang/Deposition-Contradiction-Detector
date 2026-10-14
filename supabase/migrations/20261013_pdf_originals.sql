update storage.buckets set allowed_mime_types = array['text/plain','text/markdown','application/pdf'] where id = 'case-originals' and public = false;
