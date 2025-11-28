-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Nov 21, 2025 at 12:45 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `medita_db`
--

-- --------------------------------------------------------

--
-- Table structure for table `centers`
--

CREATE TABLE `centers` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `address` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `has_help_panel` tinyint(1) DEFAULT 0,
  `is_active` tinyint(1) DEFAULT 1,
  `phone` varchar(15) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `centers`
--

INSERT INTO `centers` (`id`, `name`, `address`, `created_at`, `has_help_panel`, `is_active`, `phone`, `email`) VALUES
(1, 'Example Center', 'Some address', '2025-11-17 14:35:47', 0, 1, NULL, NULL),
(2, 'Example Center', 'Some address', '2025-11-17 18:55:20', 0, 1, NULL, NULL),
(3, 'Example Center', 'Some address', '2025-11-18 21:56:03', 0, 1, NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `center_subscriptions`
--

CREATE TABLE `center_subscriptions` (
  `id` int(11) NOT NULL,
  `center_id` int(11) NOT NULL,
  `subscription_id` int(11) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `deliveries`
--

CREATE TABLE `deliveries` (
  `id` int(11) NOT NULL,
  `center_id` int(11) NOT NULL,
  `patient_id` int(11) NOT NULL,
  `drug_form_id` int(11) NOT NULL,
  `delivery_date` date NOT NULL,
  `dose` int(11) NOT NULL,
  `dose_mg` int(11) NOT NULL,
  `prescribed_by` varchar(100) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `deliveries`
--

INSERT INTO `deliveries` (`id`, `center_id`, `patient_id`, `drug_form_id`, `delivery_date`, `dose`, `dose_mg`, `prescribed_by`, `notes`, `created_at`) VALUES
(16, 1, 1, 1, '2025-08-15', 5, 100, NULL, NULL, '2025-11-18 20:21:38'),
(17, 1, 1, 1, '2025-08-15', 5, 100, NULL, NULL, '2025-11-18 20:21:38'),
(18, 1, 1, 1, '2024-01-15', 2, 100, 'دکتر احمدی', 'تحویل اول - وضعیت بیمار مطلوب', '2025-11-18 22:02:24');

--
-- Triggers `deliveries`
--
DELIMITER $$
CREATE TRIGGER `after_delivery_insert` AFTER INSERT ON `deliveries` FOR EACH ROW BEGIN
    UPDATE patients 
    SET last_delivery_date = NEW.delivery_date
    WHERE id = NEW.patient_id;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `discounts`
--

CREATE TABLE `discounts` (
  `id` int(11) NOT NULL,
  `code` varchar(50) NOT NULL,
  `discount_percentage` decimal(5,2) NOT NULL,
  `valid_until` date NOT NULL,
  `center_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `drug_deliveries`
--

CREATE TABLE `drug_deliveries` (
  `id` int(11) NOT NULL,
  `patient_id` int(11) NOT NULL,
  `delivery_date` date NOT NULL,
  `delivery_date_gregorian` date DEFAULT NULL,
  `drug_type` varchar(100) DEFAULT NULL,
  `dosage` varchar(50) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `drug_forms`
--

CREATE TABLE `drug_forms` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `drug_forms`
--

INSERT INTO `drug_forms` (`id`, `name`, `description`) VALUES
(1, 'بوپرنورفین 0.4 میلی‌گرم', 'بوپرنورفین 0.4 میلی‌گرم'),
(2, 'بوپرنورفین 2 میلی‌گرم', 'بوپرنورفین 2 میلی‌گرم'),
(3, 'قرص متادون 5 میلی‌گرم', 'قرص متادون 5 میلی‌گرم'),
(4, 'قرص متادون 20 میلی‌گرم', 'قرص متادون 20 میلی‌گرم'),
(5, 'قرص متادون 40 میلی‌گرم', 'قرص متادون 40 میلی‌گرم'),
(6, 'شربت متادون', 'شربت متادون (هر میلی‌لیتر معادل 5 میلی‌گرم متادون)'),
(7, 'تنطور اوپیوم 1%', 'تنطور اوپیوم 1% (هر میلی‌لیتر حاوی 50 میلی‌گرم مورفین)');

-- --------------------------------------------------------

--
-- Table structure for table `monthly_reports`
--

CREATE TABLE `monthly_reports` (
  `id` int(11) NOT NULL,
  `center_id` int(11) NOT NULL,
  `jalali_year` int(11) NOT NULL,
  `jalali_month` int(11) NOT NULL,
  `total_patients` int(11) DEFAULT 0,
  `active_patients` int(11) DEFAULT 0,
  `absent_patients` int(11) DEFAULT 0,
  `total_deliveries` int(11) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `patients`
--

CREATE TABLE `patients` (
  `id` int(11) NOT NULL,
  `center_id` int(11) NOT NULL,
  `first_name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `birth_date` date DEFAULT NULL,
  `gender` enum('male','female','other') NOT NULL,
  `address` text DEFAULT NULL,
  `phone_number` varchar(15) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `deleted_at` timestamp NULL DEFAULT NULL,
  `status` enum('active','absent','transferred','completed') DEFAULT 'active',
  `last_delivery_date` date DEFAULT NULL,
  `notes` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `patients`
--

INSERT INTO `patients` (`id`, `center_id`, `first_name`, `last_name`, `birth_date`, `gender`, `address`, `phone_number`, `created_at`, `deleted_at`, `status`, `last_delivery_date`, `notes`) VALUES
(1, 1, 'John', 'Doe', '1990-05-15', 'male', '123 Main St, City', '09123456789', '2025-11-17 15:40:23', NULL, 'active', '2025-08-15', NULL),
(2, 1, 'John', 'Doe', '1990-05-15', 'male', '123 Main St, City', '09123456789', '2025-11-17 17:37:32', NULL, 'active', NULL, NULL),
(3, 1, 'John', 'Doe', '1990-05-15', 'male', '123 Main St, City', '09123456789', '2025-11-17 19:04:36', NULL, 'active', NULL, NULL),
(4, 1, 'John', 'Doe', '1990-05-15', 'male', '123 Main St, City', '09123456789', '2025-11-18 21:58:40', NULL, 'active', NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `patient_monthly_status`
--

CREATE TABLE `patient_monthly_status` (
  `id` int(11) NOT NULL,
  `patient_id` int(11) NOT NULL,
  `jalali_year` int(11) NOT NULL,
  `jalali_month` int(11) NOT NULL,
  `status` enum('active','absent','discharged','deleted') DEFAULT 'active',
  `delivery_count` int(11) DEFAULT 0,
  `last_delivery_date` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `payments`
--

CREATE TABLE `payments` (
  `id` int(11) NOT NULL,
  `center_id` int(11) NOT NULL,
  `subscription_id` int(11) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `trackId` varchar(255) NOT NULL,
  `status` enum('pending','success','failed') DEFAULT 'pending',
  `description` text DEFAULT NULL,
  `payment_date` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `subscriptions`
--

CREATE TABLE `subscriptions` (
  `id` int(11) NOT NULL,
  `plan_name` varchar(255) NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `discount_price` decimal(10,2) DEFAULT NULL,
  `duration_months` int(11) NOT NULL,
  `max_patients` int(11) NOT NULL,
  `can_view_reports` tinyint(1) DEFAULT 0,
  `can_export_reports` tinyint(1) DEFAULT 0,
  `has_help_panel` tinyint(1) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `is_active` tinyint(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `subscriptions`
--

INSERT INTO `subscriptions` (`id`, `plan_name`, `price`, `discount_price`, `duration_months`, `max_patients`, `can_view_reports`, `can_export_reports`, `has_help_panel`, `created_at`, `is_active`) VALUES
(1, 'پلن پایه', 100000.00, 90000.00, 1, 50, 1, 0, 0, '2025-11-18 20:25:23', 1),
(2, 'پلن حرفه‌ای', 250000.00, 220000.00, 3, 200, 1, 1, 0, '2025-11-18 20:25:23', 1),
(3, 'پلن سازمانی', 500000.00, 450000.00, 6, 500, 1, 1, 1, '2025-11-18 20:25:23', 1);

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `center_id` int(11) DEFAULT NULL,
  `name` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('manager','admin') NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `center_id`, `name`, `email`, `password`, `role`, `created_at`) VALUES
(5, 1, 'Ali Reza', 'ali@example.com', '$2b$10$D9BE0JLHPDsFJB/.e/TjOuBJkgwDkSGwTnfdekkeuiK4eoLR0SAG.', 'manager', '2025-11-17 14:35:47'),
(10, NULL, 'مدیر سیستم', 'superadmin@medita.ir', '$2b$10$XSyUhi5uS9BZr97DsjohLuUpDeGAElBc4V5yTL0mZptfWd3Xssouy', 'admin', '2025-11-19 14:08:17'),
(11, NULL, 'مدیر فنی سیستم', 'techadmin@medita.ir', '$2b$10$BNkACwcLvzhtQuFqUsl9lO.9YhmMKPucPBFIYGPHgUck2rJkCxas2', 'admin', '2025-11-19 14:11:40');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `centers`
--
ALTER TABLE `centers`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `center_subscriptions`
--
ALTER TABLE `center_subscriptions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `center_id` (`center_id`),
  ADD KEY `subscription_id` (`subscription_id`);

--
-- Indexes for table `deliveries`
--
ALTER TABLE `deliveries`
  ADD PRIMARY KEY (`id`),
  ADD KEY `center_id` (`center_id`),
  ADD KEY `patient_id` (`patient_id`),
  ADD KEY `drug_form_id` (`drug_form_id`);

--
-- Indexes for table `discounts`
--
ALTER TABLE `discounts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `code` (`code`),
  ADD KEY `center_id` (`center_id`);

--
-- Indexes for table `drug_deliveries`
--
ALTER TABLE `drug_deliveries`
  ADD PRIMARY KEY (`id`),
  ADD KEY `patient_id` (`patient_id`);

--
-- Indexes for table `drug_forms`
--
ALTER TABLE `drug_forms`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `monthly_reports`
--
ALTER TABLE `monthly_reports`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_center_month` (`center_id`,`jalali_year`,`jalali_month`);

--
-- Indexes for table `patients`
--
ALTER TABLE `patients`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_patients_status` (`status`),
  ADD KEY `idx_patients_last_delivery` (`last_delivery_date`),
  ADD KEY `idx_patients_center_status` (`center_id`,`status`);

--
-- Indexes for table `patient_monthly_status`
--
ALTER TABLE `patient_monthly_status`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_patient_month` (`patient_id`,`jalali_year`,`jalali_month`);

--
-- Indexes for table `payments`
--
ALTER TABLE `payments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `center_id` (`center_id`),
  ADD KEY `subscription_id` (`subscription_id`);

--
-- Indexes for table `subscriptions`
--
ALTER TABLE `subscriptions`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `center_id` (`center_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `centers`
--
ALTER TABLE `centers`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `center_subscriptions`
--
ALTER TABLE `center_subscriptions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `deliveries`
--
ALTER TABLE `deliveries`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=19;

--
-- AUTO_INCREMENT for table `discounts`
--
ALTER TABLE `discounts`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `drug_deliveries`
--
ALTER TABLE `drug_deliveries`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `drug_forms`
--
ALTER TABLE `drug_forms`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT for table `monthly_reports`
--
ALTER TABLE `monthly_reports`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `patients`
--
ALTER TABLE `patients`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `patient_monthly_status`
--
ALTER TABLE `patient_monthly_status`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `payments`
--
ALTER TABLE `payments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `subscriptions`
--
ALTER TABLE `subscriptions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `center_subscriptions`
--
ALTER TABLE `center_subscriptions`
  ADD CONSTRAINT `center_subscriptions_ibfk_1` FOREIGN KEY (`center_id`) REFERENCES `centers` (`id`),
  ADD CONSTRAINT `center_subscriptions_ibfk_2` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions` (`id`);

--
-- Constraints for table `deliveries`
--
ALTER TABLE `deliveries`
  ADD CONSTRAINT `deliveries_ibfk_1` FOREIGN KEY (`center_id`) REFERENCES `centers` (`id`),
  ADD CONSTRAINT `deliveries_ibfk_2` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`),
  ADD CONSTRAINT `deliveries_ibfk_3` FOREIGN KEY (`drug_form_id`) REFERENCES `drug_forms` (`id`);

--
-- Constraints for table `discounts`
--
ALTER TABLE `discounts`
  ADD CONSTRAINT `discounts_ibfk_1` FOREIGN KEY (`center_id`) REFERENCES `centers` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `drug_deliveries`
--
ALTER TABLE `drug_deliveries`
  ADD CONSTRAINT `drug_deliveries_ibfk_1` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`);

--
-- Constraints for table `monthly_reports`
--
ALTER TABLE `monthly_reports`
  ADD CONSTRAINT `monthly_reports_ibfk_1` FOREIGN KEY (`center_id`) REFERENCES `centers` (`id`);

--
-- Constraints for table `patients`
--
ALTER TABLE `patients`
  ADD CONSTRAINT `patients_ibfk_1` FOREIGN KEY (`center_id`) REFERENCES `centers` (`id`);

--
-- Constraints for table `patient_monthly_status`
--
ALTER TABLE `patient_monthly_status`
  ADD CONSTRAINT `patient_monthly_status_ibfk_1` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`);

--
-- Constraints for table `payments`
--
ALTER TABLE `payments`
  ADD CONSTRAINT `payments_ibfk_1` FOREIGN KEY (`center_id`) REFERENCES `centers` (`id`),
  ADD CONSTRAINT `payments_ibfk_2` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions` (`id`);

--
-- Constraints for table `users`
--
ALTER TABLE `users`
  ADD CONSTRAINT `users_ibfk_1` FOREIGN KEY (`center_id`) REFERENCES `centers` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
