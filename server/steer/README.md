# Steer (talmonlab.bgu.ac.il/steer)

A research prototype: a living split of a fund among the 98 repositories of the
GG24 Deep Funding round, kept on course by a community that spends as little
attention as possible (flags set the agenda, questions go to people without a
stake, one answer moves one small step, persistent flags escalate).

Python standard library only: `python server.py 5501`; data in `$DATA/steer.db`.
Rules live in `constitution.json` (change them by committing). The starting split
is the AI layer's weights from github.com/davidgasquez/gg24-deepfunding-market-weights.
A simulated community answers in the background (see `sim_answers_per_hour`).
