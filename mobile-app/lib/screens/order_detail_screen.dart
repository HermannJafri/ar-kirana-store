import 'package:flutter/material.dart';
import '../models/order.dart';
import '../services/api_service.dart';

const Map<String, Color> _statusColors = {
  'PENDING': Colors.amber,
  'CONFIRMED': Colors.blue,
  'OUT_FOR_DELIVERY': Colors.cyan,
  'DELIVERED': Colors.green,
  'CANCELLED': Colors.red,
};

class OrderDetailScreen extends StatefulWidget {
  final String orderId;
  const OrderDetailScreen({super.key, required this.orderId});

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  OrderResult? _order;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await ApiService.getOrder(widget.orderId);
      if (!mounted) return;
      setState(() => _order = OrderResult.fromJson(data));
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Order #${widget.orderId.substring(0, 8)}')),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null || _order == null) {
      return ListView(
        children: [
          const SizedBox(height: 80),
          Icon(Icons.error_outline, size: 48, color: Colors.red.shade300),
          const SizedBox(height: 12),
          Center(child: Text('Could not load order: ${_error ?? "not found"}', textAlign: TextAlign.center)),
          const SizedBox(height: 12),
          Center(child: OutlinedButton(onPressed: _load, child: const Text('Retry'))),
        ],
      );
    }

    final order = _order!;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Status', style: TextStyle(fontWeight: FontWeight.bold)),
                      Chip(
                        label: Text(
                          order.status.replaceAll('_', ' '),
                          style: const TextStyle(fontSize: 12, color: Colors.white),
                        ),
                        backgroundColor: _statusColors[order.status] ?? Colors.grey,
                        visualDensity: VisualDensity.compact,
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text('Placed at: ${_formatDate(order.createdAt)}'),
                  Text('Payment: ${order.paymentStatus} (Cash on Delivery)'),
                  if (order.paymentStatus == 'PARTIAL')
                    Text(
                      'Received ₹${order.amountPaid.toStringAsFixed(2)} · Remaining ₹${(order.totalAmount - order.amountPaid).toStringAsFixed(2)}',
                    ),
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
              subtitle: Text('₹${item.priceAtOrder.toStringAsFixed(2)} each'),
              trailing: Text(
                '${item.quantity} × ₹${item.priceAtOrder.toStringAsFixed(2)} = ₹${(item.quantity * item.priceAtOrder).toStringAsFixed(2)}',
              ),
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
        ],
      ),
    );
  }
}

String _formatDate(DateTime d) {
  final local = d.toLocal();
  final day = local.day.toString().padLeft(2, '0');
  final month = local.month.toString().padLeft(2, '0');
  final hour = local.hour.toString().padLeft(2, '0');
  final minute = local.minute.toString().padLeft(2, '0');
  return '$day/$month/${local.year}, $hour:$minute';
}
