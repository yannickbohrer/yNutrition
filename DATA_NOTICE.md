# Data notice

The license of this project covers its source code only. It does not cover the food data below,
which stays under the terms of its publishers. This file is a summary, not a license grant: check
each publisher's current terms before you redistribute data or use it in a product.

## Swiss Food Composition Database

- **Publisher:** Federal Food Safety and Veterinary Office FSVO (BLV)
- **Source:** [naehrwertdaten.ch](https://naehrwertdaten.ch/en/), version 7.1
- **Terms:** free of charge, and usable for commercial purposes (for example in a nutrition diary
  app) and scientific purposes, subject to acknowledgment of the source. See the
  [downloads page](https://naehrwertdaten.ch/en/downloads/) and the
  [legal information](https://naehrwertdaten.ch/en/legal-information/).

This repository does not contain the FSVO's files or a copy of its dataset. Running the import or
building the Docker image downloads the files directly from the FSVO, so each installation gets
them under the FSVO's terms. Individual food names and values do appear in
`data/search-aliases.json`, in tests and in `docs/screenshots/`, with this source acknowledged here. Docker images you build contain converted data: check the FSVO's
terms, or ask the FSVO, before you publish one.

Individual values in the database come from third-party sources, listed in the database's
_Sources_ sheet. Their rights holders may set their own conditions.

The app converts the data for its own use. Trace amounts and values below the detection limit
count as 0, unknown values stay unknown, and names use Swiss spelling. The FSVO has not reviewed
or endorsed this project, and the app's values may differ from the original data.

## Open Food Facts

Product data is fetched at runtime from [Open Food Facts](https://openfoodfacts.org) under the
[Open Database License](https://opendatacommons.org/licenses/odbl/1-0/), with individual contents
under the [Database Contents License](https://opendatacommons.org/licenses/dbcl/1-0/). The app
credits this under _Über & Quellen_ and links each product to its Open Food Facts page. Keep those
credits if you modify the app. Share-alike applies if you publish a database derived from this
data, such as the local cache. Product and brand names belong to their owners.

Recorded responses in `src/lib/server/foods/fixtures/` are used by tests and stay under these
licenses: see the [notice in that folder](src/lib/server/foods/fixtures/NOTICE.md). Open Food
Facts data also appears in `docs/screenshots/`.

## USDA FoodData Central

Data is fetched at runtime from [FoodData Central](https://fdc.nal.usda.gov) when an API key is
set. It is in the public domain (CC0), and the USDA asks users to list FoodData Central as the
source. Suggested citation: U.S. Department of Agriculture, Agricultural Research Service.
FoodData Central, 2019. fdc.nal.usda.gov.

## Third-party software

Dependencies keep their own licenses. Each build writes their license texts to
`static/third-party-licenses.txt`, and fails if a package uses a license outside the allowlist in
`scripts/dev/third-party-notices.mjs`.
