# I want to build a very simple mobile-first meal planning web app called Weekplate.

# 

# Tech requirements:

# \- React with Vite

# \- JavaScript, not TypeScript

# \- No backend

# \- No authentication

# \- No external database

# \- Use localStorage for persistence

# \- Mobile-first responsive design

# \- Simple clean UI

# \- The app will eventually get a real backend, so keep data access separated from UI logic where reasonable

# \- Do not overengineer

# 

# The app needs these features:

# 

# 1\. Daily nutrition goals

# The user can save:

# \- calories

# \- protein in grams

# \- carbohydrates in grams

# \- fat in grams

# 

# Persist the goals using localStorage.

# 

# 2\. Products

# The user can create, edit and delete products.

# 

# Each product contains:

# \- id

# \- name

# \- caloriesPer100g

# \- proteinPer100g

# \- carbsPer100g

# \- fatPer100g

# 

# Persist products using localStorage.

# 

# 3\. Saved meals

# A meal has:

# \- id

# \- name

# \- tag

# \- ingredients

# 

# Allowed tags:

# \- Breakfast

# \- Lunch

# \- Dinner

# \- Snack

# \- Other

# 

# Each ingredient contains:

# \- productId

# \- quantityGrams

# 

# The user must be able to:

# \- create a meal

# \- select products

# \- specify quantities

# \- see calculated nutrition totals

# \- edit a saved meal

# \- delete a meal

# 

# Persist meals using localStorage.

# 

# 4\. Daily meal planner

# Create a planner where the user can:

# \- add individual products

# \- add saved meals

# \- modify ingredient quantities in grams

# \- immediately see nutrition values update

# 

# At the top show:

# Calories: current / goal

# Protein: current / goal

# Carbs: current / goal

# Fat: current / goal

# 

# Also show remaining values.

# 

# If the user modifies a saved meal inside the planner, it must not modify the original saved meal.

# 

# 5\. Navigation

# Mobile bottom navigation:

# \- Today

# \- Meals

# \- Products

# \- Settings

# 

# 6\. UI

# Prioritize phone usability.

# Use large touch targets.

# Keep forms simple.

# Nutrition values should be visually easy to scan.

# No unnecessary animations.

# No large UI library unless truly necessary.

# 

# 7\. Architecture

# Create reusable utilities for nutrition calculations.

# Create a storage service/helper for localStorage instead of scattering localStorage calls everywhere.

# Use React Router if useful.

# Keep components reasonably small but do not create excessive abstractions.

# 

# First:

# 1\. inspect the existing Vite project

# 2\. propose a small folder structure

# 3\. implement the application

# 4\. run the build

# 5\. fix any errors

# 6\. tell me what was created

# 

# Do not add features outside this scope.

