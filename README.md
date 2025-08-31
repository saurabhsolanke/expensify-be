# Node.js Authentication System with MongoDB

A complete authentication system built with Node.js, Express, MongoDB, and JWT tokens.

## Features

- User registration and login
- JWT authentication
- Password hashing with bcrypt
- Input validation
- Protected routes
- User profile management
- Modern frontend interface

## Setup

1. Install dependencies: `npm install`
2. Copy `env.example` to `.env` and configure
3. Start MongoDB
4. Run: `npm run dev`

## API Endpoints

- POST `/api/auth/register` - Register user
- POST `/api/auth/login` - Login user  
- GET `/api/auth/profile` - Get profile (protected)
- PUT `/api/auth/profile` - Update profile (protected)
- POST `/api/auth/logout` - Logout (protected)

## Usage

Open `http://localhost:3000` in your browser to test the authentication system.
