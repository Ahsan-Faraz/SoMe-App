-- Indexes for the foreign keys that point at photos. Deleting a photo (replacing a profile image, a
-- decided application's images) makes Postgres find every row that uses it; without these it scanned
-- the whole of members, profile_values and applications each time. Partial: most rows have no photo.

create index members_photo on public.members (community_id, photo_id) where photo_id is not null;
create index profile_values_photo on public.profile_values (community_id, value_photo_id) where value_photo_id is not null;
create index applications_photo on public.applications (community_id, photo_id) where photo_id is not null;
create index applications_id_photo on public.applications (community_id, id_photo_id) where id_photo_id is not null;
