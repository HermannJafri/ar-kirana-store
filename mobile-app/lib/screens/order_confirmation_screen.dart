import 'package:flutter/material.dart';
import '../models/order.dart';
import 'product_browse_screen.dart';

class OrderConfirmationScreen extends StatelessWidget {
  final Map<String, dynamic> orderJson;
  const OrderConfirmationScreen({super.key, required this.orderJson});

  @override
  Widget build(BuildContext context) {
    final order = OrderResult.fromJson(orderJson);

    return Scaffold(
      appBar: AppBar(title: const Text('Order placed'), automaticallyImplyLeading: false),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Icon(Icons.check_circle, color: Colors.green, size: 64),
            const SizedBox(height: 12),
            const Center(
              child: Text('Thank you! Your order is confirmed.',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            ),
            const SizedBox(height: 4),
            Center(child: Text('Order #${order.id.substring(0, 8)}', style: TextStyle(color: Colors.grey.shade600))),
            const SizedBox(height: 24),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Status: ${order.status}', style: const TextStyle(fontWeight: FontWeight.bold)),
                    Text('Payment: ${order.paymentStatus} (Cash on Delivery)'),
                    if (order.deliveryAddress != null) Text('Deliver to: ${order.deliveryAddress}'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            const Text('Items', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            ...order.items.map(
              (item) => ListTile(
                title: Text(item.productName),
                trailing: Text('${item.quantity} × ₹${item.priceAtOrder.toStringAsFixed(2)}'),
              ),
            ),
            const Divider(),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Total', style: TextStyle(fontSize: 18)),
                  Text('₹${order.totalAmount.toStringAsFixed(2)}',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () => Navigator.of(context).pushAndRemoveUntil(
                MaterialPageRoute(builder: (_) => const ProductBrowseScreen()),
                (route) => false,
              ),
              child: const Text('Continue shopping'),
            ),
          ],
        ),
      ),
    );
  }
}
