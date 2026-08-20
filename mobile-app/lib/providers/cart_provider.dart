import 'package:flutter/foundation.dart';
import '../models/cart_item.dart';
import '../models/product.dart';

class CartProvider extends ChangeNotifier {
  final Map<String, CartItem> _items = {};

  List<CartItem> get items => _items.values.toList();

  int get itemCount => _items.values.fold(0, (sum, item) => sum + item.quantity);

  double get total => _items.values.fold(0.0, (sum, item) => sum + item.subtotal);

  int quantityOf(String productId) => _items[productId]?.quantity ?? 0;

  void add(Product product, {int quantity = 1}) {
    final existing = _items[product.id];
    if (existing != null) {
      existing.quantity += quantity;
    } else {
      _items[product.id] = CartItem(product: product, quantity: quantity);
    }
    notifyListeners();
  }

  void updateQuantity(String productId, int quantity) {
    if (quantity <= 0) {
      _items.remove(productId);
    } else if (_items.containsKey(productId)) {
      _items[productId]!.quantity = quantity;
    }
    notifyListeners();
  }

  void remove(String productId) {
    _items.remove(productId);
    notifyListeners();
  }

  void clear() {
    _items.clear();
    notifyListeners();
  }
}
