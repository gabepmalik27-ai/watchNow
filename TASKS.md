# WatchNow — Tasks Before Presentation

**Presentation:** Monday 11/23
**Code freeze:** Saturday 11/21, end of day. Nothing merges after this.
**Rehearsal:** Sunday 11/22

Check off your tasks (`- [x]`) in the same PR that completes them.

## Gabriel

- [ ] 1. **(Tue 11/17)** Define the `user_preferences` table (genres, actors, directors, movie types) and the `getScores(userId)` contract, so Matt and Grant can work in parallel
- [x] 2. Switch ratings to the 1–10 scale, with 6 labeled "average"
- [ ] 3. **(Fri 11/20)** "Tonight" group sync: a temporary link that combines several people's recommendations into one, with adjustable weights per person
- [ ] 4. **(Wed 11/18)** Check-in with Matt on the algorithm PR
- [ ] 5. **(Sat 11/21)** Add a README note that Supabase "Confirm email" must stay off; review the npm audit notice (no `--force`)
- [ ] 6. **(Sun 11/22)** Demo prep: script, seeded demo accounts, rehearsal, and confirm Supabase isn't paused

## Matt — Algorithm & recommendations

- [ ] 1. **(Wed 11/18)** Open a draft PR for the improved algorithm: uses stated preferences, average ratings, and preferred genres, actors, directors and movie types
- [ ] 2. **(Thu 11/19)** Algorithm merged. Done when the new scoring parts show up in `?debug=1` and `npm run eval` doesn't get worse on any persona
- [ ] 3. **(Sat 11/21)** Rating filter when looking for recommendations
- [ ] 4. *(Stretch)* Check one recommendation score by hand using `?debug=1`

## Grant — Design & UI

- [ ] 1. **(Thu 11/19)** Preferences page, as a sub-page of For You, saving to `user_preferences`
- [ ] 2. **(Fri 11/20)** New-user onboarding: rate about 5 movies to personalize
- [ ] 3. **(Fri 11/20)** Fix the error message that screen readers don't announce while the Rate dialog is open
- [ ] 4. **(Sat 11/21)** Visual polish across all pages: easier to use, cleaner layout, follows the design tokens in `CLAUDE.md`
- [ ] 5. *(Stretch)* Profile and settings pages (including color scheme)

## Everyone — by Sun 11/22

- [ ] 1. Lessons-learned prep, written in your own words
- [ ] 2. Be able to explain your own area cold during the demo

## After the presentation

- Catalog expansion (vote-count measurements, stratified seeding, niche-film pool, import on search miss)
- Weekly auto-refresh via GitHub Actions
- Store all directors per movie
- LLM-generated mood tags
- Documentary-lover evaluation persona
