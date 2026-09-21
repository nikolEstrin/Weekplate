\# Weekplate Project Instructions



\## Goal



Weekplate is a very simple mobile-first meal planning web application.



The immediate goal is to have a usable version quickly.



Do not overengineer.



\---



\## Tech stack



\- React

\- Vite

\- JavaScript

\- CSS

\- localStorage

\- No backend

\- No database

\- No authentication

\- No TypeScript

\- No external state-management library

\- Avoid unnecessary dependencies



\---



\## Architecture principles



Keep data/storage logic separate from UI where reasonable.



Use:



src/

&#x20; components/

&#x20; pages/

&#x20; services/

&#x20; utils/



Storage access should go through:



src/services/storage.js



Nutrition calculations should go through:



src/utils/nutrition.js



Do not scatter localStorage logic across React components.



Do not duplicate nutrition formulas.



\---



\## Data models



\### Product



{

&#x20; id: string,

&#x20; name: string,

&#x20; caloriesPer100g: number,

&#x20; proteinPer100g: number,

&#x20; carbsPer100g: number,

&#x20; fatPer100g: number

}



\### Meal



{

&#x20; id: string,

&#x20; name: string,

&#x20; tag: "Breakfast" | "Lunch" | "Dinner" | "Snack" | "Other",

&#x20; ingredients: \[

&#x20;   {

&#x20;     productId: string,

&#x20;     quantityGrams: number

&#x20;   }

&#x20; ]

}



\### Daily goals



{

&#x20; calories: number,

&#x20; protein: number,

&#x20; carbs: number,

&#x20; fat: number

}



\### Planned meal



A planned meal is a snapshot.



Changing quantities inside Today's planner MUST NOT modify the original saved meal.



\---



\## Nutrition formula



All product nutrition values are stored per 100 grams.



For a quantity:



value = valuePer100g \* quantityGrams / 100



Round only for display.



Do calculations using full numeric precision.



\---



\## Required pages



\### Today



Shows:



\- calories current / goal

\- protein current / goal

\- carbs current / goal

\- fat current / goal

\- remaining nutrition

\- today's planned meals

\- ability to add saved meals

\- ability to add individual products

\- ability to edit ingredient quantities



\### Meals



Shows:



\- saved meals

\- search

\- filter by tag

\- create meal

\- edit meal

\- delete meal



\### Products



Shows:



\- products

\- search

\- add product

\- edit product

\- delete product



\### Settings



Allows editing:



\- daily calorie target

\- protein target

\- carbs target

\- fat target



\---



\## UI requirements



Mobile-first.



Primary target width:

375–430px.



Bottom navigation:



\- Today

\- Meals

\- Products

\- Settings



Style:



\- light interface

\- white background

\- restrained green accent

\- rounded cards

\- subtle borders/shadows

\- clear nutrition information

\- large touch targets

\- no gradients

\- minimal animations

\- avoid unnecessary decorative elements



Desktop can center the mobile application inside a wider viewport.



\---



\## Validation



Do not allow:



\- negative quantities

\- NaN nutrition values

\- blank product names

\- blank meal names

\- zero or negative ingredient quantities



Handle empty localStorage safely.



\---



\## Development rules



Do not add features unless requested.



Before modifying code:

1\. inspect relevant files

2\. make the smallest reasonable change



After modifying code:

1\. run npm run build

2\. fix errors

3\. summarize exactly what changed



Avoid rewriting unrelated files.



Prefer simple readable code over abstractions.



When working on one feature, do not redesign unrelated parts of the application.

