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

This repository does not contain the FSVO's files or data derived from them. Running the import
or building the Docker image downloads the files directly from the FSVO, so each installation
gets them under the FSVO's terms. Docker images you build contain converted data: check the FSVO's
terms, or ask the FSVO, before you publish one.

Individual values in the database come from third-party sources, listed in the database's
_Sources_ sheet. Their rights holders may set their own conditions.

The app converts the data for its own use. Trace amounts and values below the detection limit
count as 0, unknown values stay unknown, and names use Swiss spelling. The FSVO has not reviewed
or endorsed this project, and the app's values may differ from the original data.

## Open Food Facts

Product data is fetched at runtime from [Open Food Facts](https://world.openfoodfacts.org) under
the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/), with individual
contents under the [Database Contents License](https://opendatacommons.org/licenses/dbcl/1-0/).
Share-alike applies to data derived from it.

## USDA FoodData Central

Data is fetched at runtime from [FoodData Central](https://fdc.nal.usda.gov) when an API key is
set. It is in the public domain (CC0).
